import {
  type AttendanceSessionDetailDTO,
  attendanceWindow,
  campusClock,
  type MyAttendanceCourseDTO,
} from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AttendanceSession, CourseOffering, Section } from '../src/models';
import { sessionToken } from '../src/services/attendance';
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

const NAVEED = 'naveed.anwar@comsats.edu.pk';

const send = (cookie: string, method: string, path: string, body?: unknown) =>
  app.api(cookie, path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

async function offeringId(code: string, sectionName: string): Promise<string> {
  const section = await Section.findOne({ name: sectionName }).lean();
  const offering = await CourseOffering.findOne({ code, sectionId: section?._id }).lean();
  if (!offering) throw new Error(`No ${code} for ${sectionName}`);
  return String(offering._id);
}

async function open(cookie: string, code: string, section: string) {
  const res = await send(cookie, 'POST', '/api/teaching/attendance', {
    offeringId: await offeringId(code, section),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as AttendanceSessionDetailDTO;
}

const qr = async (cookie: string, sessionId: string) =>
  (await app.api(cookie, `/api/teaching/attendance/${sessionId}/qr`)).json();

const checkIn = (cookie: string, sessionId: string, token: string) =>
  send(cookie, 'POST', '/api/academics/attendance/check-in', { sessionId, token });

describe('attendance summaries', () => {
  it('shows each student their percentage per course, with warnings and shortages', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const mine: MyAttendanceCourseDTO[] = await (
      await app.api(hira, '/api/academics/attendance')
    ).json();
    expect(mine.length).toBeGreaterThanOrEqual(5);
    const cloud = mine.find((c) => c.course.code === 'CSC455');
    expect(cloud?.summary.state).toBe('warning');
    expect(cloud?.minimum).toBe(80);
    expect(cloud?.sessions.length).toBe(cloud?.summary.held);

    const ahmed = await app.login(ACCOUNTS.ahmed);
    const his: MyAttendanceCourseDTO[] = await (
      await app.api(ahmed, '/api/academics/attendance')
    ).json();
    expect(his.find((c) => c.course.code === 'CSC441')?.summary.state).toBe('short');

    // Teachers have no attendance of their own; they see their courses instead.
    const imran = await app.login(ACCOUNTS.imran);
    expect(await (await app.api(imran, '/api/academics/attendance')).json()).toEqual([]);
    const courses = await (await app.api(imran, '/api/teaching/courses')).json();
    const awt = courses.find(
      (c: { course: { code: string; sectionName: string } }) =>
        c.course.code === 'CSC337' && c.course.sectionName === 'BCS-7A',
    );
    expect(awt.sessionsHeld).toBeGreaterThan(5);
    expect(awt.averagePercent).toBeGreaterThan(70);
  });
});

describe('QR check-in', () => {
  it('accepts only enrolled students with a current code, live to the teacher only', async () => {
    const imran = await app.login(ACCOUNTS.imran);
    const detail = await open(imran, 'CSC337', 'BCS-7A');
    const sessionId = detail.session.id;
    expect(detail.session.status).toBe('open');
    expect(detail.roster).toHaveLength(6);
    expect(detail.roster.every((r) => r.status === null)).toBe(true);

    const teacherSocket = await app.connect(ACCOUNTS.imran);
    const otherTeacher = await app.connect(ACCOUNTS.fatima);
    const hira = await app.login(ACCOUNTS.hira);

    // Only the people running the session can show the code.
    expect((await app.api(hira, `/api/teaching/attendance/${sessionId}/qr`)).status).toBe(403);
    const code = await qr(imran, sessionId);
    expect(code.path).toBe(`/attend/${sessionId}?t=${code.token}`);
    expect(code.remainingMs).toBeGreaterThan(0);
    expect(code.remainingMs).toBeLessThanOrEqual(10_000);

    const live = nextEvent(teacherSocket, 'attendance:update', (e) => e.sessionId === sessionId);
    const quiet = noEvent(otherTeacher, 'attendance:update');
    const res = await checkIn(hira, sessionId, code.token);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: 'present',
      already: false,
      course: { code: 'CSC337' },
    });
    const event = await live;
    expect(event.entry?.student.name).toBe('Hira Khan');
    expect(event.entry?.status).toBe('present');
    expect(event.counts).toMatchObject({ present: 1, unmarked: 5 });
    expect(await quiet).toBe(true);

    // Scanning twice is harmless.
    expect(await (await checkIn(hira, sessionId, code.token)).json()).toMatchObject({
      already: true,
    });

    // A forwarded code doesn't work for someone outside the course.
    const usman = await app.login(ACCOUNTS.usman);
    const outsider = await checkIn(usman, sessionId, code.token);
    expect(outsider.status).toBe(403);
    expect((await outsider.json()).error.message).toMatch(/not enrolled/);

    // A code from two windows ago has expired; made-up codes never work.
    const session = await AttendanceSession.findById(sessionId).select('+secret').lean();
    const old = sessionToken(session?.secret ?? '', sessionId, attendanceWindow() - 2);
    const ali = await app.login(ACCOUNTS.ali);
    const expired = await checkIn(ali, sessionId, old);
    expect(expired.status).toBe(400);
    expect((await expired.json()).error.message).toMatch(/expired/);
    expect((await checkIn(ali, sessionId, 'AAAAAAAAAAAAAAAAAAAAAA')).status).toBe(400);
    expect((await checkIn(ali, sessionId, '<script>')).status).toBe(400);
  });

  it('marks late check-ins, respects the teacher untick, and closes with absences', async () => {
    const imran = await app.login(ACCOUNTS.imran);
    const detail = await open(imran, 'CSC337', 'BCS-7A');
    const sessionId = detail.session.id;
    // Attendance opened 20 minutes ago.
    await AttendanceSession.updateOne(
      { _id: sessionId },
      { $set: { openedAt: new Date(Date.now() - 20 * 60_000) } },
    );
    const ali = await app.login(ACCOUNTS.ali);
    const late = await checkIn(ali, sessionId, (await qr(imran, sessionId)).token);
    expect((await late.json()).status).toBe('late');

    // The teacher unticks Ali (not in the room): scanning again is refused.
    const aliUser = await userBy(ACCOUNTS.ali);
    const mark = await send(
      imran,
      'PUT',
      `/api/teaching/attendance/${sessionId}/students/${aliUser._id}`,
      { status: 'absent' },
    );
    expect(await mark.json()).toMatchObject({ status: 'absent', method: 'manual' });
    const again = await checkIn(ali, sessionId, (await qr(imran, sessionId)).token);
    expect(again.status).toBe(403);

    // A student who isn't enrolled can't be marked.
    const usman = await userBy(ACCOUNTS.usman);
    expect(
      (
        await send(imran, 'PUT', `/api/teaching/attendance/${sessionId}/students/${usman._id}`, {
          status: 'present',
        })
      ).status,
    ).toBe(400);

    const closed: AttendanceSessionDetailDTO = await (
      await send(imran, 'POST', `/api/teaching/attendance/${sessionId}/close`)
    ).json();
    expect(closed.session.status).toBe('closed');
    expect(closed.session.counts.unmarked).toBe(0);
    expect(closed.roster.filter((r) => r.method === 'auto').length).toBeGreaterThan(0);

    const ahmed = await app.login(ACCOUNTS.ahmed);
    const tooLate = await checkIn(ahmed, sessionId, 'AAAAAAAAAAAAAAAAAAAAAA');
    expect(tooLate.status).toBe(409);
    expect((await tooLate.json()).error.message).toMatch(/closed/);
  });

  it('warns a student once when they are short of the minimum', async () => {
    const naveed = await app.login(NAVEED);
    const ahmedSocket = await app.connect(ACCOUNTS.ahmed);
    const detail = await open(naveed, 'CSC441', 'BCS-7A');
    const warned = nextEvent(
      ahmedSocket,
      'notification:new',
      (n) => n.type === 'attendance' && n.title.startsWith('Attendance shortage'),
    );
    await send(naveed, 'POST', `/api/teaching/attendance/${detail.session.id}/close`);
    const notification = await warned;
    expect(notification.title).toMatch(/Compiler Construction · BCS-7A is at \d+(\.\d)?%/);
    expect(notification.link).toBe('/academics/attendance');

    // The same shortage isn't announced again on the next class.
    const again = await open(naveed, 'CSC441', 'BCS-7A');
    expect(again.session.id).toBe(detail.session.id); // the same class reopens
    const repeat = noEvent(ahmedSocket, 'notification:new');
    await send(naveed, 'POST', `/api/teaching/attendance/${detail.session.id}/close`);
    expect(await repeat).toBe(true);
  });
});

describe('who can run and see attendance', () => {
  it('limits running a session to its teacher, and the sheet to the people responsible', async () => {
    const fatima = await app.login(ACCOUNTS.fatima);
    const awt7a = await offeringId('CSC337', 'BCS-7A');
    const refused = await send(fatima, 'POST', '/api/teaching/attendance', { offeringId: awt7a });
    expect(refused.status).toBe(403);

    const imran = await app.login(ACCOUNTS.imran);
    const tomorrow = new Date(Date.now() + 86_400_000);
    const future = await send(imran, 'POST', '/api/teaching/attendance', {
      offeringId: awt7a,
      date: campusClock(tomorrow).date,
    });
    expect(future.status).toBe(400);

    const sheet = await (await app.api(imran, `/api/teaching/courses/${awt7a}/attendance`)).json();
    expect(sheet.students).toHaveLength(6);
    expect(sheet.students[0].statuses).toHaveLength(sheet.sessions.length);

    const hod = await app.login(ACCOUNTS.hodCS);
    expect((await app.api(hod, `/api/teaching/courses/${awt7a}/attendance`)).status).toBe(200);
    const hira = await app.login(ACCOUNTS.hira);
    expect((await app.api(hira, `/api/teaching/courses/${awt7a}/attendance`)).status).toBe(403);
    const sana = await app.login(ACCOUNTS.sana);
    expect((await app.api(sana, `/api/teaching/courses/${awt7a}/attendance`)).status).toBe(403);
  });

  it('lets only IT change the minimum, and summaries follow it', async () => {
    const admin = await app.login(ACCOUNTS.admin);
    const imran = await app.login(ACCOUNTS.imran);
    expect((await send(imran, 'PUT', '/api/admin/settings', { minAttendance: 60 })).status).toBe(
      403,
    );
    expect((await send(admin, 'PUT', '/api/admin/settings', { minAttendance: 40 })).status).toBe(
      400,
    );
    const saved = await send(admin, 'PUT', '/api/admin/settings', { minAttendance: 60 });
    expect(await saved.json()).toEqual({ minAttendance: 60 });

    const ahmed = await app.login(ACCOUNTS.ahmed);
    const his: MyAttendanceCourseDTO[] = await (
      await app.api(ahmed, '/api/academics/attendance')
    ).json();
    const compiler = his.find((c) => c.course.code === 'CSC441');
    expect(compiler?.minimum).toBe(60);
    expect(compiler?.summary.state).not.toBe('short');

    await send(admin, 'PUT', '/api/admin/settings', { minAttendance: 80 });
    expect(await (await app.api(ahmed, '/api/academics/settings')).json()).toEqual({
      minAttendance: 80,
    });
  });
});
