import {
  addDays,
  type CalendarEventDTO,
  type CalendarItemDTO,
  campusInstant,
  type TimetableWeekDTO,
} from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ClassSlot, CourseOffering, Exam, Notification, Section } from '../src/models';
import { resetReminderMemory, runReminders } from '../src/services/reminders';
import {
  ACCOUNTS,
  clearWeekMonday,
  nextEvent,
  startTestApp,
  type TestApp,
  userBy,
} from './helpers';

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

describe('academic calendar', () => {
  it('lists the term dates, including public holidays', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const dates: CalendarEventDTO[] = await (
      await app.api(hira, '/api/academics/calendar?from=2026-11-01&to=2026-12-31')
    ).json();
    expect(dates.map((d) => d.title)).toEqual(
      expect.arrayContaining(['Iqbal Day', 'Sessional II week', 'Quaid-e-Azam Day']),
    );
    expect(dates.find((d) => d.title === 'Iqbal Day')?.kind).toBe('holiday');
    // A whole term at once is fine for the academic calendar; my calendar goes by month.
    const term = await app.api(hira, '/api/academics/calendar?from=2026-09-01&to=2027-01-31');
    expect(term.status).toBe(200);
    const tooLong = await app.api(
      hira,
      '/api/academics/calendar/mine?from=2026-09-01&to=2027-01-31',
    );
    expect(tooLong.status).toBe(400);
  });

  it("lets only the Director's Office add a holiday, which cancels that day's classes", async () => {
    const wednesday = addDays(clearWeekMonday(), 2);
    const holiday = {
      title: 'Campus closed (weather)',
      kind: 'holiday',
      startsOn: wednesday,
      endsOn: wednesday,
    };
    const imran = await app.login(ACCOUNTS.imran);
    expect((await send(imran, 'POST', '/api/academics/calendar', holiday)).status).toBe(403);

    const hiraSocket = await app.connect(ACCOUNTS.hira);
    const told = nextEvent(hiraSocket, 'notification:new', (n) => n.title.startsWith('Holiday'));
    const refresh = nextEvent(hiraSocket, 'timetable:changed');
    const director = await app.login(ACCOUNTS.director);
    const created = await send(director, 'POST', '/api/academics/calendar', holiday);
    expect(created.status).toBe(201);
    const entry: CalendarEventDTO = await created.json();
    expect((await told).title).toBe('Holiday: Campus closed (weather)');
    await refresh;

    const hira = await app.login(ACCOUNTS.hira);
    const week: TimetableWeekDTO = await (
      await app.api(hira, `/api/academics/timetable?week=${wednesday}`)
    ).json();
    const day = week.days.find((d) => d.date === wednesday);
    expect(day?.occurrences.length).toBeGreaterThan(0);
    expect(day?.occurrences.every((o) => o.status === 'cancelled' && !o.canChange)).toBe(true);
    expect(day?.occurrences[0]?.note).toBe('Holiday: Campus closed (weather)');

    // A class can't be moved onto the holiday.
    const section = await Section.findOne({ name: 'BCS-7A' }).lean();
    const offering = await CourseOffering.findOne({
      code: 'CSC337',
      sectionId: section?._id,
    }).lean();
    const slot = await ClassSlot.findOne({ offeringId: offering?._id, day: 1 }).lean();
    const move = await send(imran, 'POST', `/api/academics/timetable/slots/${slot?._id}/changes`, {
      kind: 'moved',
      date: clearWeekMonday(),
      newDate: wednesday,
      newStart: '16:00',
      newEnd: '17:00',
      newRoomId: null,
    });
    expect(move.status).toBe(400);
    expect((await move.json()).error.message).toMatch(/is a holiday/);

    // Removing the holiday brings the classes back.
    await send(director, 'DELETE', `/api/academics/calendar/${entry.id}`);
    const after: TimetableWeekDTO = await (
      await app.api(hira, `/api/academics/timetable?week=${wednesday}`)
    ).json();
    expect(
      after.days
        .find((d) => d.date === wednesday)
        ?.occurrences.every((o) => o.status === 'scheduled'),
    ).toBe(true);
  });

  it('names a public holiday inside an exam week as the holiday', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const week: TimetableWeekDTO = await (
      await app.api(hira, '/api/academics/timetable?week=2026-11-09')
    ).json();
    const notes = (date: string) =>
      new Set(week.days.find((d) => d.date === date)?.occurrences.map((o) => o.note));
    expect(week.days.every((d) => d.occurrences.every((o) => o.suspended))).toBe(true);
    expect(notes('2026-11-09')).toEqual(new Set(['Holiday: Iqbal Day']));
    expect(notes('2026-11-10')).toEqual(new Set(['Sessional II week: no regular classes']));
  });

  it('suspends a class moved onto a day that later becomes a holiday', async () => {
    const monday = clearWeekMonday();
    const wednesday = addDays(monday, 2);
    const section = await Section.findOne({ name: 'BCS-7A' }).lean();
    const offering = await CourseOffering.findOne({
      code: 'CSC337',
      sectionId: section?._id,
    }).lean();
    const slot = await ClassSlot.findOne({ offeringId: offering?._id, day: 1 }).lean();
    const imran = await app.login(ACCOUNTS.imran);
    const moved = await send(imran, 'POST', `/api/academics/timetable/slots/${slot?._id}/changes`, {
      kind: 'moved',
      date: monday,
      newDate: wednesday,
      newStart: '17:00',
      newEnd: '18:00',
      newRoomId: null,
    });
    expect(moved.status).toBe(200);

    const director = await app.login(ACCOUNTS.director);
    const entry: CalendarEventDTO = await (
      await send(director, 'POST', '/api/academics/calendar', {
        title: 'Campus closed (strike)',
        kind: 'holiday',
        startsOn: wednesday,
        endsOn: wednesday,
      })
    ).json();
    const hira = await app.login(ACCOUNTS.hira);
    const week: TimetableWeekDTO = await (
      await app.api(hira, `/api/academics/timetable?week=${monday}`)
    ).json();
    const makeUp = week.days
      .find((d) => d.date === wednesday)
      ?.occurrences.find((o) => o.slot.id === String(slot?._id));
    expect(makeUp).toMatchObject({
      status: 'cancelled',
      suspended: true,
      canChange: false,
      note: 'Holiday: Campus closed (strike)',
    });

    await send(director, 'DELETE', `/api/academics/calendar/${entry.id}`);
    await send(imran, 'DELETE', `/api/academics/timetable/slots/${slot?._id}/changes/${monday}`);
  });
});

describe('my calendar', () => {
  it('merges my classes, my papers with seats, and academic dates', async () => {
    const exam = await Exam.findOne({ kind: 'sessional2', code: 'CSC337' }).lean();
    const from = exam?.date ?? '';
    const hira = await app.login(ACCOUNTS.hira);
    const items: CalendarItemDTO[] = await (
      await app.api(hira, `/api/academics/calendar/mine?from=${from}&to=${addDays(from, 6)}`)
    ).json();
    const paper = items.find((i) => i.kind === 'exam' && i.title.startsWith('CSC337'));
    expect(paper?.detail).toMatch(/row \d+, seat \d+/);
    // A multi-day entry appears on each day it covers and carries its last day.
    const examWeek = items.filter((i) => i.kind === 'academic' && i.title === 'Sessional II week');
    expect(examWeek.length).toBeGreaterThan(1);
    expect(new Set(examWeek.map((i) => i.endsOn))).toEqual(new Set(['2026-11-14']));
    expect(items.find((i) => i.kind === 'exam')?.endsOn).toBeNull();

    const week = clearWeekMonday();
    const classes: CalendarItemDTO[] = await (
      await app.api(hira, `/api/academics/calendar/mine?from=${week}&to=${addDays(week, 5)}`)
    ).json();
    expect(classes.filter((i) => i.kind === 'class').length).toBeGreaterThanOrEqual(8);
    expect(classes.every((i) => i.date >= week && i.date <= addDays(week, 5))).toBe(true);
  });
});

describe('reminders', () => {
  it('reminds students the evening before a paper, once, with their seat', async () => {
    resetReminderMemory();
    const exam = await Exam.findOne({ kind: 'sessional2', code: 'CSC337' }).lean();
    const evening = campusInstant(addDays(exam?.date ?? '', -1), '18:30');
    const hira = await userBy(ACCOUNTS.hira);
    expect(await runReminders(new Date(evening.getTime() - 3 * 3600_000))).toBe(0); // 3:30 PM
    expect(await runReminders(evening)).toBeGreaterThan(0);
    const reminder = await Notification.findOne({
      userId: hira._id,
      title: { $regex: '^Tomorrow: CSC337 Sessional II' },
    }).lean();
    expect(reminder?.body).toMatch(/row \d+, seat \d+/);
    // The next minute, or after a restart, nothing is sent again.
    expect(await runReminders(new Date(evening.getTime() + 60_000))).toBe(0);
    resetReminderMemory();
    expect(await runReminders(new Date(evening.getTime() + 120_000))).toBe(0);
  });

  it('announces deadlines and registration on the morning they start', async () => {
    resetReminderMemory();
    const morning = campusInstant('2026-12-14', '08:05');
    expect(await runReminders(morning)).toBeGreaterThan(10);
    const ali = await userBy(ACCOUNTS.ali);
    expect(
      await Notification.exists({
        userId: ali._id,
        title: 'Today: Course registration for Spring 2027',
      }),
    ).toBeTruthy();
  });
});
