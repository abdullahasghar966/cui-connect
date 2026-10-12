import { addDays, campusClock, type RoomFinderDTO } from '@cui/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClassSlot, CourseOffering, Exam, Room, User } from '../src/models';
import { ACCOUNTS, clearWeekMonday, startTestApp, type TestApp } from './helpers';

let app: TestApp;

beforeAll(async () => {
  app = await startTestApp();
});

afterAll(async () => {
  await app?.close();
});

const finder = async (cookie: string, date: string, time: string): Promise<RoomFinderDTO> =>
  (await app.api(cookie, `/api/academics/rooms/finder?date=${date}&time=${time}`)).json();

describe('room finder', () => {
  it('shows who is in a room now, frees it when the class is cancelled, and counts exams', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const monday = clearWeekMonday();
    const slot = await ClassSlot.findOne({ day: 1, start: '08:30', roomId: { $ne: null } }).lean();
    const room = await Room.findById(slot?.roomId).lean();
    const offering = await CourseOffering.findById(slot?.offeringId).lean();

    const busy = await finder(hira, monday, '09:00');
    const status = busy.rooms.find((r) => r.room.id === String(room?._id));
    expect(status?.current).toMatchObject({ kind: 'class', start: '08:30' });
    expect(status?.current?.title).toContain(offering?.code);
    expect(status?.bookings.length).toBeGreaterThan(0);
    // Some room is free all morning.
    expect(busy.rooms.some((r) => !r.current)).toBe(true);

    // Free before the class, until it starts.
    const early = await finder(hira, monday, '07:45');
    expect(early.rooms.find((r) => r.room.id === String(room?._id))?.freeUntil).toBe('08:30');

    // The teacher cancels that class: the room is free at 09:00.
    const teacher = await User.findById(offering?.instructorId).lean();
    const cookie = await app.login(teacher?.email ?? '');
    await app.api(cookie, `/api/academics/timetable/slots/${slot?._id}/changes`, {
      method: 'POST',
      body: JSON.stringify({ kind: 'cancelled', date: monday }),
    });
    const freed = await finder(hira, monday, '09:00');
    expect(freed.rooms.find((r) => r.room.id === String(room?._id))?.current).toBeNull();

    // Exam papers book rooms too.
    const exam = await Exam.findOne({ kind: 'sessional2' }).lean();
    const sitting = await finder(hira, exam?.date ?? '', exam?.start ?? '');
    const hall = sitting.rooms.find((r) => r.room.id === String(exam?.roomIds[0]));
    expect(hall?.current).toMatchObject({ kind: 'exam', detail: 'Sessional II' });
  });

  it('warns the Exam Office when a paper takes a room from a timetabled class', async () => {
    // A Tuesday class (the first test cancelled a Monday one) in a room with exam seating.
    const tuesday = addDays(clearWeekMonday(), 1);
    const examRooms = await Room.find({ examRows: { $gt: 0 } })
      .select('_id')
      .lean();
    const slot = await ClassSlot.findOne({
      day: 2,
      start: '08:30',
      roomId: { $in: examRooms.map((r) => r._id) },
    }).lean();
    const office = await app.login(ACCOUNTS.exam);
    const options = await (await app.api(office, '/api/exams/options')).json();
    const course = options.courses.find((c: { code: string }) => c.code === 'CSC498');
    const res = await app.api(office, '/api/exams/check', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'terminal',
        code: 'CSC498',
        offeringIds: course.offerings.map((o: { offeringId: string }) => o.offeringId),
        date: tuesday,
        start: '09:00',
        end: '10:00',
        roomIds: [String(slot?.roomId)],
      }),
    });
    const check = await res.json();
    expect(check.warnings.join(' ')).toMatch(/normally has .* the paper takes the room/);
  });

  it('defaults to now and rejects malformed times', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const now = await (await app.api(hira, '/api/academics/rooms/finder')).json();
    expect(now.date).toBe(campusClock().date);
    expect(now.rooms.length).toBeGreaterThan(5);
    expect((await app.api(hira, '/api/academics/rooms/finder?time=25:00')).status).toBe(400);
  });
});
