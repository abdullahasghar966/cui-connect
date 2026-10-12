import {
  type BookingDTO,
  type CalendarItemDTO,
  campusInstant,
  type TeacherSlotsDTO,
} from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Notification } from '../src/models';
import { resetReminderMemory, runReminders } from '../src/services/reminders';
import { ACCOUNTS, nextEvent, startTestApp, type TestApp, userBy } from './helpers';

let app: TestApp;
let imranId: string;

beforeAll(async () => {
  app = await startTestApp();
  imranId = String((await userBy(ACCOUNTS.imran))._id);
});

afterEach(async () => {
  await app.disconnectAll();
});

afterAll(async () => {
  await app?.close();
});

const ZAINAB = 'FA23-BCS-004';

const slotsOf = async (cookie: string, teacherId: string): Promise<TeacherSlotsDTO> =>
  (await app.api(cookie, `/api/academics/teachers/${teacherId}/slots`)).json();

/** The first free slot, on a day not in `avoid`. */
function freeSlot(view: TeacherSlotsDTO, avoid: string[] = []) {
  for (const day of view.days) {
    if (avoid.includes(day.date)) continue;
    const slot = day.slots.find((s) => !s.taken);
    if (slot) return { date: day.date, start: slot.start };
  }
  throw new Error(`No free slot with ${view.teacher.name}`);
}

const book = (cookie: string, teacherId: string, slot: { date: string; start: string }) =>
  app.api(cookie, '/api/academics/bookings', {
    method: 'POST',
    body: JSON.stringify({ teacherId, ...slot, topic: 'Questions about rooms and namespaces' }),
  });

describe('office-hour appointments', () => {
  let booking: BookingDTO;

  it("lists a teacher's slots to the students who may contact them", async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const view = await slotsOf(hira, imranId);
    expect(view).toMatchObject({ canBook: true, reason: null });
    expect(view.days.length).toBeGreaterThan(0);
    for (const slot of view.days.flatMap((d) => d.slots)) {
      const [h, m] = slot.start.split(':').map(Number);
      const [eh, em] = slot.end.split(':').map(Number);
      expect((eh ?? 0) * 60 + (em ?? 0) - ((h ?? 0) * 60 + (m ?? 0))).toBe(15);
    }

    // An EE student not taught by this CS teacher may not message them, so may not book either.
    const mehwish = await app.login(ACCOUNTS.mehwish);
    const blocked = await slotsOf(mehwish, imranId);
    expect(blocked.canBook).toBe(false);
    expect(blocked.reason).toMatch(/messaging rules/);
    const teacher = await app.login(ACCOUNTS.imran);
    expect((await slotsOf(teacher, imranId)).canBook).toBe(false);
  });

  it('books a free slot once, tells the teacher, and refuses double or invalid bookings', async () => {
    const imranSocket = await app.connect(ACCOUNTS.imran);
    const told = nextEvent(imranSocket, 'notification:new', (n) => n.type === 'bookings');
    const hira = await app.login(ACCOUNTS.hira);
    const slot = freeSlot(await slotsOf(hira, imranId));
    const created = await book(hira, imranId, slot);
    expect(created.status).toBe(201);
    booking = await created.json();
    expect(booking).toMatchObject({ ...slot, status: 'booked', teacher: { id: imranId } });
    expect(booking.location).toMatch(/Faculty Block/);
    expect((await told).title).toBe('Office hours booked: Hira Khan');

    // The slot is hers now; nobody else can have it.
    const mine = (await slotsOf(hira, imranId)).days
      .find((d) => d.date === slot.date)
      ?.slots.find((s) => s.start === slot.start);
    expect(mine).toMatchObject({ taken: true, mine: true });
    const zainab = await app.login(ZAINAB);
    const clash = await book(zainab, imranId, slot);
    expect(clash.status).toBe(409);

    // One appointment per teacher per day; only real office-hour times; only allowed students.
    const sameDay = (await slotsOf(hira, imranId)).days
      .find((d) => d.date === slot.date)
      ?.slots.find((s) => !s.taken);
    if (sameDay) {
      const again = await book(hira, imranId, { date: slot.date, start: sameDay.start });
      expect(again.status).toBe(400);
      expect((await again.json()).error.message).toMatch(/already have an appointment/);
    }
    expect((await book(hira, imranId, { date: slot.date, start: '03:00' })).status).toBe(400);
    const mehwish = await app.login(ACCOUNTS.mehwish);
    expect((await book(mehwish, imranId, slot)).status).toBe(403);
  });

  it('either person can cancel before it starts; the other is told and the slot frees up', async () => {
    const hiraSocket = await app.connect(ACCOUNTS.hira);
    const told = nextEvent(
      hiraSocket,
      'notification:new',
      (n) => n.type === 'bookings' && n.title.includes('cancelled'),
    );
    const imran = await app.login(ACCOUNTS.imran);
    const list: BookingDTO[] = await (await app.api(imran, '/api/academics/bookings')).json();
    expect(list.map((b) => b.id)).toContain(booking.id);

    const ali = await app.login(ACCOUNTS.ali);
    const cancel = (cookie: string) =>
      app.api(cookie, `/api/academics/bookings/${booking.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Faculty meeting' }),
      });
    expect((await cancel(ali)).status).toBe(404);
    const cancelled = await cancel(imran);
    expect(await cancelled.json()).toMatchObject({ status: 'cancelled', cancelledBy: 'teacher' });
    expect((await told).body).toMatch(/Faculty meeting/);
    expect((await cancel(imran)).status).toBe(400);

    const zainab = await app.login(ZAINAB);
    expect((await book(zainab, imranId, booking)).status).toBe(201);
  });

  it('limits how many upcoming appointments a student holds', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const teachers = await Promise.all(
      [
        'naveed.anwar@comsats.edu.pk',
        'fatima.noor@comsats.edu.pk',
        'hamza.tariq@comsats.edu.pk',
        'ayesha.siddiqui@comsats.edu.pk',
      ].map(async (email) => String((await userBy(email))._id)),
    );
    const results: number[] = [];
    for (const teacherId of teachers) {
      results.push((await book(hira, teacherId, freeSlot(await slotsOf(hira, teacherId)))).status);
    }
    expect(results).toEqual([201, 201, 201, 400]);
  });

  it('reminds both people on the morning of the appointment, and shows it on My calendar', async () => {
    resetReminderMemory();
    const zainab = await app.login(ZAINAB);
    const list: BookingDTO[] = await (await app.api(zainab, '/api/academics/bookings')).json();
    const upcoming = list.find((b) => b.status === 'booked');
    if (!upcoming) throw new Error('Zainab has no appointment');
    expect(await runReminders(campusInstant(upcoming.date, '08:05'))).toBeGreaterThan(0);

    const [student, teacher] = await Promise.all([userBy(ZAINAB), userBy(ACCOUNTS.imran)]);
    expect(
      await Notification.exists({
        userId: student._id,
        title: { $regex: '^Today at .*: office hours with Dr\\. Imran Haider$' },
      }),
    ).toBeTruthy();
    expect(
      await Notification.exists({
        userId: teacher._id,
        title: { $regex: '^Office hours today: \\d+ appointments?$' },
      }),
    ).toBeTruthy();

    const items: CalendarItemDTO[] = await (
      await app.api(
        zainab,
        `/api/academics/calendar/mine?from=${upcoming.date}&to=${upcoming.date}`,
      )
    ).json();
    expect(items.find((i) => i.kind === 'booking')).toMatchObject({
      title: 'Office hours with Dr. Imran Haider',
      start: upcoming.start,
    });
  });
});
