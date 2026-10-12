import { campusClock, type ServiceRequestDTO } from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AttendanceRecord,
  AttendanceSession,
  CourseOffering,
  type CourseOfferingDoc,
  Section,
} from '../src/models';
import { ACCOUNTS, nextEvent, startTestApp, type TestApp, userBy } from './helpers';

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

const AFFAIRS = 'student.affairs@comsats.edu.pk';

const post = (cookie: string, path: string, body: unknown = {}) =>
  app.api(cookie, path, { method: 'POST', body: JSON.stringify(body) });

const list = async (cookie: string, box: 'mine' | 'inbox'): Promise<ServiceRequestDTO[]> =>
  (await app.api(cookie, `/api/services/requests?box=${box}`)).json();

describe('leave applications', () => {
  let leave: ServiceRequestDTO;
  let absentSessionId: string;

  it('go to the batch advisor, who is told live; nobody else can see them', async () => {
    const hira = await userBy(ACCOUNTS.hira);
    const absent = await AttendanceRecord.findOne({ studentId: hira._id, status: 'absent' }).lean();
    if (!absent) throw new Error('Hira has no absence in the demo data');
    absentSessionId = String(absent.sessionId);
    const session = await AttendanceSession.findById(absent.sessionId).lean();
    const day = session?.date ?? '';

    const advisor = await app.connect(ACCOUNTS.imran);
    const told = nextEvent(advisor, 'notification:new', (n) => n.type === 'requests');
    const hiraCookie = await app.login(ACCOUNTS.hira);
    const created = await post(hiraCookie, '/api/services/requests', {
      kind: 'leave',
      from: day,
      to: day,
      reason: 'I had a fever and the doctor told me to rest.',
    });
    expect(created.status).toBe(201);
    leave = await created.json();
    expect(leave).toMatchObject({
      kind: 'leave',
      status: 'submitted',
      handledBy: 'Dr. Imran Haider (batch advisor)',
      canHandle: false,
    });
    expect((await told).title).toBe('New leave application from Hira Khan');

    // Another teacher, IT and the Exam Office can't open it.
    for (const other of [ACCOUNTS.fatima, ACCOUNTS.admin, ACCOUNTS.exam]) {
      const cookie = await app.login(other);
      expect((await app.api(cookie, `/api/services/requests/${leave.id}`)).status).toBe(404);
    }
    const imran = await app.login(ACCOUNTS.imran);
    expect((await list(imran, 'inbox')).find((r) => r.id === leave.id)?.canHandle).toBe(true);
    expect((await list(hiraCookie, 'mine')).map((r) => r.id)).toContain(leave.id);
  });

  it('once approved, turn the missed class into "leave" and tell the student', async () => {
    const hiraSocket = await app.connect(ACCOUNTS.hira);
    const told = nextEvent(hiraSocket, 'notification:new', (n) =>
      n.title.startsWith('Leave application'),
    );
    const hiraCookie = await app.login(ACCOUNTS.hira);
    // Students can't answer their own requests.
    expect(
      (await post(hiraCookie, `/api/services/requests/${leave.id}/status`, { status: 'approved' }))
        .status,
    ).toBe(403);

    const imran = await app.login(ACCOUNTS.imran);
    const approved = await post(imran, `/api/services/requests/${leave.id}/status`, {
      status: 'approved',
      note: 'Get well soon.',
    });
    expect(await approved.json()).toMatchObject({ status: 'approved' });
    const notice = await told;
    expect(notice.title).toBe('Leave application: Approved');
    expect(notice.body).toMatch(/1 missed class is now marked as leave/);

    const hira = await userBy(ACCOUNTS.hira);
    const record = await AttendanceRecord.findOne({
      sessionId: absentSessionId,
      studentId: hira._id,
    }).lean();
    expect(record?.status).toBe('leave');

    // Final: it can't be answered again or withdrawn.
    expect(
      (await post(imran, `/api/services/requests/${leave.id}/status`, { status: 'rejected' }))
        .status,
    ).toBe(400);
    expect((await post(hiraCookie, `/api/services/requests/${leave.id}/withdraw`)).status).toBe(
      400,
    );
  });

  it('mark a student on leave as "leave" when the teacher closes attendance that day', async () => {
    const today = campusClock().date;
    const hiraCookie = await app.login(ACCOUNTS.hira);
    const imran = await app.login(ACCOUNTS.imran);
    const request: ServiceRequestDTO = await (
      await post(hiraCookie, '/api/services/requests', {
        kind: 'leave',
        from: today,
        to: today,
        reason: 'Attending my sister’s wedding today.',
      })
    ).json();
    await post(imran, `/api/services/requests/${request.id}/status`, { status: 'approved' });

    const section = await Section.findOne({ name: 'BCS-7A' }).lean();
    const awt = await CourseOffering.findOne({
      code: 'CSC337',
      sectionId: section?._id,
    }).lean<CourseOfferingDoc>();
    const started = await post(imran, '/api/teaching/attendance', { offeringId: String(awt?._id) });
    expect(started.status).toBe(201);
    const { session } = await started.json();
    await post(imran, `/api/teaching/attendance/${session.id}/close`);
    const hira = await userBy(ACCOUNTS.hira);
    const record = await AttendanceRecord.findOne({
      sessionId: session.id,
      studentId: hira._id,
    }).lean();
    expect(record?.status).toBe('leave');
  });
});

describe('letters and ID cards', () => {
  it('go to their office, move step by step, and both sides can write to each other', async () => {
    const aliCookie = await app.login(ACCOUNTS.ali);
    const transcript: ServiceRequestDTO = await (
      await post(aliCookie, '/api/services/requests', {
        kind: 'transcript',
        copies: 2,
        purpose: 'Applying for a summer internship',
      })
    ).json();
    expect(transcript).toMatchObject({
      title: 'Official transcript (2 copies)',
      handledBy: 'Examination Office',
    });

    const exam = await app.login(ACCOUNTS.exam);
    expect((await list(exam, 'inbox')).map((r) => r.id)).toContain(transcript.id);
    const affairs = await app.login(AFFAIRS);
    expect((await list(affairs, 'inbox')).map((r) => r.id)).not.toContain(transcript.id);

    await post(exam, `/api/services/requests/${transcript.id}/status`, { status: 'in_review' });
    const aliSocket = await app.connect(ACCOUNTS.ali);
    const ready = nextEvent(aliSocket, 'notification:new', (n) =>
      n.title.startsWith('Official transcript'),
    );
    await post(exam, `/api/services/requests/${transcript.id}/status`, {
      status: 'completed',
      note: 'Collect it from Room 12 with your ID card.',
    });
    expect((await ready).title).toBe('Official transcript: Ready to collect');
    // Completed is final.
    expect(
      (await post(exam, `/api/services/requests/${transcript.id}/status`, { status: 'in_review' }))
        .status,
    ).toBe(400);

    const examSocket = await app.connect(ACCOUNTS.exam);
    const reply = nextEvent(examSocket, 'notification:new', (n) => n.title.includes('replied'));
    const replied: ServiceRequestDTO = await (
      await post(aliCookie, `/api/services/requests/${transcript.id}/replies`, {
        body: 'Can my brother collect it?',
      })
    ).json();
    expect((await reply).title).toBe('Ali Raza replied: Official transcript (2 copies)');
    expect(replied.events.map((e) => e.kind)).toEqual(['created', 'status', 'status', 'reply']);
  });
});

describe('complaints', () => {
  it('reach Student Affairs, are for students only, and can be withdrawn while open', async () => {
    const hiraCookie = await app.login(ACCOUNTS.hira);
    const complaint: ServiceRequestDTO = await (
      await post(hiraCookie, '/api/services/requests', {
        kind: 'complaint',
        category: 'facilities',
        subject: 'Projector in A-101 is not working',
        description: 'It has not worked for the last three AWT lectures.',
      })
    ).json();
    expect(complaint).toMatchObject({ handledBy: 'Student Affairs', status: 'submitted' });

    const affairs = await app.login(AFFAIRS);
    const answered: ServiceRequestDTO = await (
      await post(affairs, `/api/services/requests/${complaint.id}/status`, {
        status: 'in_review',
        note: 'Maintenance has been told.',
      })
    ).json();
    expect(answered.status).toBe('in_review');

    const withdrawn = await post(hiraCookie, `/api/services/requests/${complaint.id}/withdraw`);
    expect(await withdrawn.json()).toMatchObject({ status: 'withdrawn' });

    const imran = await app.login(ACCOUNTS.imran);
    const notStudent = await post(imran, '/api/services/requests', {
      kind: 'complaint',
      category: 'other',
      subject: 'Teachers cannot file these',
      description: 'This should be refused politely.',
    });
    expect(notStudent.status).toBe(403);
    const tooLong = await post(hiraCookie, '/api/services/requests', {
      kind: 'leave',
      from: '2026-11-01',
      to: '2026-11-30',
      reason: 'A whole month away is too long for one application.',
    });
    expect(tooLong.status).toBe(400);
  });
});
