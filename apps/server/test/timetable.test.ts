import {
  addDays,
  BLOCKING_CLASHES,
  type ClassOccurrenceDTO,
  type ClassSlotDTO,
  campusClock,
  campusInstant,
  findClashes,
  mondayOf,
  type TimetableWeekDTO,
} from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ClassSlot, CourseOffering, Section } from '../src/models';
import { todayFor } from '../src/services/timetable';
import { ACCOUNTS, nextEvent, noEvent, startTestApp, type TestApp, userBy } from './helpers';

let app: TestApp;

beforeAll(async () => {
  app = await startTestApp();
});

afterEach(async () => {
  await app.disconnectAll();
});

afterAll(async () => {
  await app?.close();
});

const send = (cookie: string, method: string, path: string, body?: unknown) =>
  app.api(cookie, path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const week = async (cookie: string, query = ''): Promise<TimetableWeekDTO> =>
  (await app.api(cookie, `/api/academics/timetable${query}`)).json();

const occurrences = (w: TimetableWeekDTO): ClassOccurrenceDTO[] =>
  w.days.flatMap((d) => d.occurrences);

async function sectionSlots(cookie: string, sectionName: string): Promise<ClassSlotDTO[]> {
  const section = await Section.findOne({ name: sectionName }).lean();
  return (await app.api(cookie, `/api/academics/timetable/sections/${section?._id}/slots`)).json();
}

/** The date of `day` (1 = Monday) in the week after this one. */
const nextWeek = (day: number) => addDays(mondayOf(campusClock().date), 7 + day - 1);

describe('the seeded timetable', () => {
  it('has no double-booked room, teacher or section', async () => {
    const slots = await ClassSlot.find().lean();
    const shaped = slots.map((s) => ({
      id: String(s._id),
      day: s.day,
      start: s.start,
      end: s.end,
      roomId: String(s.roomId),
      instructorId: String(s.instructorId),
      sectionId: String(s.sectionId),
    }));
    for (const slot of shaped) {
      const blocking = findClashes(slot, shaped).filter((c) => BLOCKING_CLASHES.includes(c.kind));
      expect(blocking, `clash for ${slot.id}`).toEqual([]);
    }
    expect(slots.length).toBeGreaterThan(20);
  });

  it("shows each person their own classes and other people's on request", async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const mine = occurrences(await week(hira, `?week=${nextWeek(1)}`));
    const codes = new Set(mine.map((o) => `${o.slot.code} ${o.slot.sectionName}`));
    expect(codes).toContain('CSC337 BCS-7A');
    expect([...codes].every((c) => c.endsWith('BCS-7A'))).toBe(true);
    // She is in the course, so its chat is one click away.
    expect(mine.find((o) => o.slot.code === 'CSC337')?.slot.groupId).toBeTruthy();
    expect(mine.every((o) => !o.canChange)).toBe(true);

    const imran = await app.login(ACCOUNTS.imran);
    const taught = occurrences(await week(imran, `?week=${nextWeek(1)}`));
    expect(taught.length).toBeGreaterThan(0);
    expect(taught.every((o) => o.slot.instructor?.name === 'Dr. Imran Haider')).toBe(true);
    expect(taught.every((o) => o.canChange)).toBe(true);

    const section7B = await Section.findOne({ name: 'BCS-7B' }).lean();
    const other = await week(hira, `?view=section&id=${section7B?._id}&week=${nextWeek(1)}`);
    expect(other.title).toBe('BCS-7B');
    expect(occurrences(other).every((o) => o.slot.sectionName === 'BCS-7B')).toBe(true);
    // Not her course: no chat link, no controls.
    expect(occurrences(other).every((o) => o.slot.groupId === null && !o.canChange)).toBe(true);
  });
});

describe('editing the weekly timetable', () => {
  it('is reserved to IT and the department office of that department', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const csOffice = await app.login('cs.office@comsats.edu.pk');
    const [slot] = await sectionSlots(hira, 'BCS-7A');
    const body = {
      offeringId: slot?.offeringId,
      day: 6,
      start: '16:00',
      end: '17:30',
      roomId: null,
      kind: 'lecture',
    };
    expect((await send(hira, 'POST', '/api/academics/timetable/slots', body)).status).toBe(403);
    const created = await send(csOffice, 'POST', '/api/academics/timetable/slots', body);
    expect(created.status).toBe(201);
    const { slot: saved } = await created.json();
    expect(saved).toMatchObject({ day: 6, start: '16:00', sectionName: 'BCS-7A' });

    const beeSlot = (await sectionSlots(hira, 'BEE-7A'))[0];
    const ee = await send(csOffice, 'POST', '/api/academics/timetable/slots', {
      ...body,
      offeringId: beeSlot?.offeringId,
    });
    expect(ee.status).toBe(403);
    expect(
      (await send(csOffice, 'DELETE', `/api/academics/timetable/slots/${saved.id}`)).status,
    ).toBe(200);
  });

  it('refuses double bookings and explains why', async () => {
    const admin = await app.login(ACCOUNTS.admin);
    const slots7A = await sectionSlots(admin, 'BCS-7A');
    const slots7B = await sectionSlots(admin, 'BCS-7B');
    const taken = slots7A[0] as ClassSlotDTO;
    const other = slots7B.find((s) => s.instructor?.id !== taken.instructor?.id) as ClassSlotDTO;
    const body = {
      offeringId: other.offeringId,
      day: taken.day,
      start: taken.start,
      end: taken.end,
      roomId: taken.room?.id ?? null,
      kind: 'lecture',
    };
    const check = await (await send(admin, 'POST', '/api/academics/timetable/check', body)).json();
    expect(check.blocking.join(' ')).toContain(`${taken.room?.name} is already booked`);

    const refused = await send(admin, 'POST', '/api/academics/timetable/slots', body);
    expect(refused.status).toBe(409);
    expect((await refused.json()).error.message).toContain('already booked');

    const backwards = await send(admin, 'POST', '/api/academics/timetable/slots', {
      ...body,
      start: '11:00',
      end: '10:00',
    });
    expect(backwards.status).toBe(400);
  });

  it('warns (but allows) when a repeater would be in two classes at once', async () => {
    const admin = await app.login(ACCOUNTS.admin);
    const room = async (name: string) =>
      (
        await (
          await send(admin, 'POST', '/api/admin/rooms', {
            name,
            block: 'Test Block',
            kind: 'classroom',
            capacity: 50,
          })
        ).json()
      ).id;
    const [r1, r2] = [await room('T-1'), await room('T-2')];
    const offering = async (code: string, section: string) =>
      CourseOffering.findOne({
        code,
        sectionId: (await Section.findOne({ name: section }).lean())?._id,
      }).lean();
    const cloud = await offering('CSC455', 'BCS-7B');
    const cc7A = await offering('CSC441', 'BCS-7A');

    const slot = { day: 6, start: '18:00', end: '19:00', kind: 'lecture' };
    const first = await send(admin, 'POST', '/api/academics/timetable/slots', {
      ...slot,
      offeringId: String(cloud?._id),
      roomId: r1,
    });
    expect(first.status).toBe(201);
    // Bilal (BCS-7B) repeats Compiler Construction with BCS-7A.
    const second = await send(admin, 'POST', '/api/academics/timetable/slots', {
      ...slot,
      offeringId: String(cc7A?._id),
      roomId: r2,
    });
    expect(second.status).toBe(201);
    const { warnings } = await second.json();
    expect(warnings.join(' ')).toMatch(/1 enrolled student also takes .*repeaters/);

    // A room with classes can't be deleted.
    expect((await send(admin, 'DELETE', `/api/admin/rooms/${r1}`)).status).toBe(409);
  });
});

describe('cancelling and moving one class', () => {
  it('reaches enrolled students live, and only the instructor may do it', async () => {
    const imran = await app.login(ACCOUNTS.imran);
    const fatima = await app.login(ACCOUNTS.fatima);
    const awt = (await sectionSlots(imran, 'BCS-7A')).find(
      (s) => s.code === 'CSC337',
    ) as ClassSlotDTO;
    const date = nextWeek(awt.day);

    const hiraSocket = await app.connect(ACCOUNTS.hira);
    const usmanSocket = await app.connect(ACCOUNTS.usman);
    const alert = nextEvent(hiraSocket, 'notification:new', (n) => n.type === 'timetable');
    const refresh = nextEvent(hiraSocket, 'timetable:changed');
    const usmanQuiet = noEvent(usmanSocket, 'notification:new');

    const path = `/api/academics/timetable/slots/${awt.id}/changes`;
    expect((await send(fatima, 'POST', path, { kind: 'cancelled', date })).status).toBe(403);
    const cancelled = await send(imran, 'POST', path, {
      kind: 'cancelled',
      date,
      note: 'I am at a conference.',
    });
    expect(cancelled.status).toBe(200);
    expect((await alert).title).toMatch(/Advanced Web Technologies · BCS-7A on .* is cancelled/);
    expect((await refresh).offeringIds).toEqual([awt.offeringId]);
    expect(await usmanQuiet).toBe(true);

    const hira = await app.login(ACCOUNTS.hira);
    const onDay = occurrences(await week(hira, `?week=${date}`)).filter(
      (o) => o.slot.id === awt.id && o.date === date,
    );
    expect(onDay).toMatchObject([{ status: 'cancelled', note: 'I am at a conference.' }]);

    // Restoring brings it back.
    expect((await send(imran, 'DELETE', `${path}/${date}`)).status).toBe(200);
    const restored = occurrences(await week(hira, `?week=${date}`)).find(
      (o) => o.slot.id === awt.id && o.date === date,
    );
    expect(restored?.status).toBe('scheduled');
  });

  it('moves a class to a free time and refuses busy rooms or past dates', async () => {
    const imran = await app.login(ACCOUNTS.imran);
    const awt = (await sectionSlots(imran, 'BCS-7A')).find(
      (s) => s.code === 'CSC337',
    ) as ClassSlotDTO;
    const date = nextWeek(awt.day);
    const saturday = nextWeek(6);
    const path = `/api/academics/timetable/slots/${awt.id}/changes`;

    const past = await send(imran, 'POST', path, {
      kind: 'cancelled',
      date: addDays(mondayOf(campusClock().date), -7 + awt.day - 1),
    });
    expect(past.status).toBe(400);
    const wrongDay = await send(imran, 'POST', path, { kind: 'cancelled', date: addDays(date, 1) });
    expect(wrongDay.status).toBe(400);

    // Another BCS-7A class occupies its own room at its own time.
    const busy = (await sectionSlots(imran, 'BCS-7A')).find((s) => s.id !== awt.id) as ClassSlotDTO;
    const clash = await send(imran, 'POST', path, {
      kind: 'moved',
      date,
      newDate: nextWeek(busy.day),
      newStart: busy.start,
      newEnd: busy.end,
      newRoomId: busy.room?.id ?? null,
    });
    expect(clash.status).toBe(409);

    const moved = await send(imran, 'POST', path, {
      kind: 'moved',
      date,
      newDate: saturday,
      newStart: '09:00',
      newEnd: '10:30',
      newRoomId: awt.room?.id ?? null,
    });
    expect(moved.status).toBe(200);
    const hira = await app.login(ACCOUNTS.hira);
    const list = occurrences(await week(hira, `?week=${date}`)).filter((o) => o.slot.id === awt.id);
    expect(list.find((o) => o.date === date)).toMatchObject({
      status: 'moved-out',
      movedTo: { date: saturday, start: '09:00' },
    });
    expect(list.find((o) => o.date === saturday)).toMatchObject({
      status: 'moved-in',
      start: '09:00',
      movedFrom: { date },
    });
    await send(imran, 'DELETE', `${path}/${date}`);
  });
});

describe('now and next', () => {
  it('finds the current and next class from the campus clock', async () => {
    const hira = await userBy(ACCOUNTS.hira);
    const monday = nextWeek(1);
    const early = await todayFor(hira, campusInstant(monday, '07:00'));
    expect(early.current).toBeNull();
    const firstToday = early.today.find((o) => o.status === 'scheduled');
    expect(early.next?.date).toBe(firstToday ? monday : early.next?.date);
    if (firstToday) {
      expect(early.next?.start).toBe(firstToday.start);
      const during = await todayFor(hira, campusInstant(monday, firstToday.start));
      expect(during.current?.slot.id).toBe(firstToday.slot.id);
    }
    const sunday = await todayFor(hira, campusInstant(addDays(monday, -1), '12:00'));
    expect(sunday.today).toEqual([]);
    expect(sunday.next?.date).toBe(monday);
  });
});
