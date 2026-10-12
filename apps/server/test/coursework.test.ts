import type {
  AssignmentDetailDTO,
  AssignmentDTO,
  CourseworkCourseDTO,
  CourseworkOverviewDTO,
  FileDTO,
  FilePurpose,
  MarksSheetDTO,
  QuizViewDTO,
} from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CourseOffering, type CourseOfferingDoc, Section, StoredFile, User } from '../src/models';
import {
  ACCOUNTS,
  type ClientSocket,
  nextEvent,
  noEvent,
  startTestApp,
  type TestApp,
  userBy,
} from './helpers';

let app: TestApp;
let awt: CourseOfferingDoc;

beforeAll(async () => {
  app = await startTestApp();
  const section = await Section.findOne({ name: 'BCS-7A' }).lean();
  const offering = await CourseOffering.findOne({
    code: 'CSC337',
    sectionId: section?._id,
  }).lean<CourseOfferingDoc>();
  if (!offering) throw new Error('No AWT offering');
  awt = offering;
});

afterEach(async () => {
  await app.disconnectAll();
});

afterAll(async () => {
  await app?.close();
});

const send = (cookie: string, method: string, path: string, body?: unknown) =>
  app.api(cookie, path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const upload = (
  cookie: string,
  purpose: FilePurpose,
  name: string,
  bytes: Buffer = Buffer.from(`Contents of ${name}`),
  offeringId = String(awt._id),
) =>
  app.api(cookie, `/api/files?purpose=${purpose}&offeringId=${offeringId}`, {
    method: 'POST',
    body: bytes,
    headers: {
      'content-type': 'application/octet-stream',
      'x-file-name': encodeURIComponent(name),
    },
  });

const uploaded = async (cookie: string, purpose: FilePurpose, name: string): Promise<FileDTO> => {
  const res = await upload(cookie, purpose, name);
  expect(res.status).toBe(201);
  return res.json();
};

const inHours = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();

const newAssignment = async (cookie: string, overrides: Record<string, unknown> = {}) => {
  const res = await send(cookie, 'POST', `/api/teaching/courses/${awt._id}/assignments`, {
    title: 'Lab task: Socket.IO rooms',
    instructions: 'Build a chat with two rooms.',
    dueAt: inHours(48),
    total: 20,
    ...overrides,
  });
  expect(res.status).toBe(201);
  return (await res.json()) as AssignmentDTO;
};

const detail = async (cookie: string, id: string): Promise<AssignmentDetailDTO> =>
  (await app.api(cookie, `/api/coursework/assignments/${id}`)).json();

describe('files', () => {
  it('accepts known file types up to 5 MB and keeps unattached uploads private', async () => {
    const imran = await app.login(ACCOUNTS.imran);
    const hira = await app.login(ACCOUNTS.hira);

    const slides = await uploaded(imran, 'material', 'Week 1 slides.pdf');
    expect(slides).toMatchObject({ name: 'Week 1 slides.pdf', type: 'application/pdf' });
    expect((await upload(imran, 'material', 'setup.exe')).status).toBe(400);
    const big = await upload(imran, 'material', 'big.pdf', Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(big.status).toBe(413);
    expect((await big.json()).error.message).toMatch(/at most 5 MB/);

    // Only the teacher posts material; students upload their own work.
    expect((await upload(hira, 'material', 'notes.pdf')).status).toBe(403);
    expect((await upload(hira, 'submission', 'answer.docx')).status).toBe(201);
    const usman = await app.login(ACCOUNTS.usman); // BCS-7B: not in this class
    expect((await upload(usman, 'submission', 'answer.docx')).status).toBe(403);

    // Not attached to anything yet: only the uploader can download it.
    expect((await app.api(hira, slides.url)).status).toBe(404);
    const own = await app.api(imran, slides.url);
    expect(own.status).toBe(200);
    expect(own.headers.get('content-disposition')).toMatch(
      /^attachment; filename="Week 1 slides\.pdf"/,
    );
    expect(await own.text()).toBe('Contents of Week 1 slides.pdf');
  });
});

describe('assignments', () => {
  let assignment: AssignmentDTO;

  it('only the instructor sets one; the class is told and can open the handout', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    expect(
      (
        await send(hira, 'POST', `/api/teaching/courses/${awt._id}/assignments`, {
          title: 'Not allowed',
          dueAt: inHours(24),
          total: 10,
        })
      ).status,
    ).toBe(403);

    const imran = await app.login(ACCOUNTS.imran);
    const past = await send(imran, 'POST', `/api/teaching/courses/${awt._id}/assignments`, {
      title: 'In the past',
      dueAt: inHours(-1),
      total: 10,
    });
    expect(past.status).toBe(400);

    const hiraSocket = await app.connect(ACCOUNTS.hira);
    const told = nextEvent(hiraSocket, 'notification:new', (n) =>
      n.title.startsWith('New assignment'),
    );
    const handout = await uploaded(imran, 'assignment', 'Lab task.pdf');
    assignment = await newAssignment(imran, { attachmentIds: [handout.id] });
    expect(assignment.attachments.map((f) => f.name)).toEqual(['Lab task.pdf']);
    expect((await told).link).toBe(`/academics/assignments/${assignment.id}`);

    expect((await app.api(hira, handout.url)).status).toBe(200);
    const usman = await app.login(ACCOUNTS.usman);
    expect((await app.api(usman, `/api/coursework/assignments/${assignment.id}`)).status).toBe(403);
    expect((await app.api(usman, handout.url)).status).toBe(404);

    // Its marks column appears in the marks sheet.
    const sheet: MarksSheetDTO = await (
      await app.api(imran, `/api/teaching/courses/${awt._id}/marks`)
    ).json();
    expect(sheet.assessments.find((a) => a.id === assignment.assessmentId)).toMatchObject({
      type: 'assignment',
      total: 20,
      published: false,
    });
  });

  it('takes work on time, then late while allowed, then refuses it', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const first = await uploaded(hira, 'submission', 'chat.zip');
    const handIn = await send(
      hira,
      'PUT',
      `/api/coursework/assignments/${assignment.id}/submission`,
      {
        fileIds: [first.id],
        note: 'Rooms work; see README.',
      },
    );
    expect(handIn.status).toBe(200);
    expect(await handIn.json()).toMatchObject({ late: false, note: 'Rooms work; see README.' });

    // A classmate can't open it; the teacher and the HOD can.
    const ali = await app.login(ACCOUNTS.ali);
    expect((await app.api(ali, first.url)).status).toBe(404);
    const imran = await app.login(ACCOUNTS.imran);
    expect((await app.api(imran, first.url)).status).toBe(200);
    const hod = await app.login(ACCOUNTS.hodCS);
    expect((await app.api(hod, first.url)).status).toBe(200);
    // Someone else's upload can't be passed off as yours.
    expect(
      (
        await send(ali, 'PUT', `/api/coursework/assignments/${assignment.id}/submission`, {
          fileIds: [first.id],
        })
      ).status,
    ).toBe(400);

    // Handing in again replaces the old file.
    const second = await uploaded(hira, 'submission', 'chat-v2.zip');
    await send(hira, 'PUT', `/api/coursework/assignments/${assignment.id}/submission`, {
      fileIds: [second.id],
    });
    expect((await app.api(imran, first.url)).status).toBe(404);
    expect(await StoredFile.exists({ _id: first.id })).toBeNull();

    // The teacher moves the due time into the past but accepts late work for an hour.
    const moved = await send(imran, 'PUT', `/api/teaching/assignments/${assignment.id}`, {
      title: assignment.title,
      dueAt: inHours(-1),
      lateUntil: inHours(1),
      total: 20,
      attachmentIds: assignment.attachments.map((f) => f.id),
    });
    expect(moved.status).toBe(200);
    const ahmed = await app.login(ACCOUNTS.ahmed);
    const late = await send(
      ahmed,
      'PUT',
      `/api/coursework/assignments/${assignment.id}/submission`,
      {
        note: 'Sorry, my laptop broke.',
      },
    );
    expect(await late.json()).toMatchObject({ late: true });
    const view = await detail(imran, assignment.id);
    expect(view.stats).toMatchObject({ submitted: 2, late: 2 });

    // No more late work: closed.
    await send(imran, 'PUT', `/api/teaching/assignments/${assignment.id}`, {
      title: assignment.title,
      dueAt: inHours(-1),
      lateUntil: null,
      total: 20,
      attachmentIds: assignment.attachments.map((f) => f.id),
    });
    const closed = await send(
      ali,
      'PUT',
      `/api/coursework/assignments/${assignment.id}/submission`,
      {
        note: 'Too late?',
      },
    );
    expect(closed.status).toBe(400);
    expect((await closed.json()).error.message).toMatch(/Submissions closed/);
  });

  it('grades go into the marks sheet; returning them tells each student', async () => {
    const imran = await app.login(ACCOUNTS.imran);
    const hira = await userBy(ACCOUNTS.hira);
    const ahmed = await userBy(ACCOUNTS.ahmed);
    const graded = await send(imran, 'PUT', `/api/teaching/assignments/${assignment.id}/grades`, {
      grades: [
        { studentId: String(hira._id), obtained: 18, feedback: 'Clean code. Handle reconnects.' },
        { studentId: String(ahmed._id), obtained: 9 },
      ],
    });
    expect(graded.status).toBe(200);
    const tooHigh = await send(imran, 'PUT', `/api/teaching/assignments/${assignment.id}/grades`, {
      grades: [{ studentId: String(hira._id), obtained: 21 }],
    });
    expect(tooHigh.status).toBe(400);

    const hiraCookie = await app.login(ACCOUNTS.hira);
    expect((await detail(hiraCookie, assignment.id)).grade).toBeNull();

    const hiraSocket = await app.connectWithCookie(hiraCookie);
    const told = nextEvent(hiraSocket, 'notification:new', (n) =>
      n.title.endsWith('marks are out'),
    );
    const returned = await send(
      imran,
      'POST',
      `/api/teaching/assignments/${assignment.id}/return`,
      {
        returned: true,
      },
    );
    expect(returned.status).toBe(200);
    const notice = await told;
    expect(notice.body).toMatch(/You scored 18\/20/);
    expect(notice.link).toBe(`/academics/assignments/${assignment.id}`);

    expect((await detail(hiraCookie, assignment.id)).grade).toEqual({
      obtained: 18,
      feedback: 'Clean code. Handle reconnects.',
    });
    const sheet: MarksSheetDTO = await (
      await app.api(imran, `/api/teaching/courses/${awt._id}/marks`)
    ).json();
    const column = sheet.assessments.findIndex((a) => a.id === assignment.assessmentId);
    expect(sheet.assessments[column]?.published).toBe(true);
    expect(sheet.students.find((s) => s.student.id === String(hira._id))?.marks[column]).toBe(18);

    // The column belongs to the assignment: it goes when the assignment goes.
    const direct = await send(
      imran,
      'DELETE',
      `/api/teaching/assessments/${assignment.assessmentId}`,
    );
    expect(direct.status).toBe(400);
    const attachedSubmissions = () =>
      StoredFile.countDocuments({ purpose: 'submission', attachedTo: { $ne: null } });
    const filesBefore = await attachedSubmissions();
    expect((await send(imran, 'DELETE', `/api/teaching/assignments/${assignment.id}`)).status).toBe(
      200,
    );
    const after: MarksSheetDTO = await (
      await app.api(imran, `/api/teaching/courses/${awt._id}/marks`)
    ).json();
    expect(after.assessments.some((a) => a.id === assignment.assessmentId)).toBe(false);
    // Its submissions' files went with it (Hira's file; Ahmed only wrote a note).
    expect(await attachedSubmissions()).toBe(filesBefore - 1);
  });

  it('lists what each student still has to hand in', async () => {
    const imran = await app.login(ACCOUNTS.imran);
    const open = await newAssignment(imran, {
      title: 'Reading: WebSocket RFC',
      dueAt: inHours(30),
    });
    const hira = await app.login(ACCOUNTS.hira);
    const overview: CourseworkOverviewDTO = await (await app.api(hira, '/api/coursework')).json();
    expect(overview.upcoming.find((a) => a.id === open.id)).toMatchObject({ state: 'todo' });
    expect(overview.courses.find((c) => c.course.code === 'CSC337')?.pending).toBeGreaterThan(0);

    const toGrade = async () => {
      const teacher: CourseworkOverviewDTO = await (await app.api(imran, '/api/coursework')).json();
      return teacher.courses.find((c) => c.course.offeringId === String(awt._id))?.pending ?? 0;
    };
    const waiting = await toGrade();
    await send(hira, 'PUT', `/api/coursework/assignments/${open.id}/submission`, {
      note: 'Read it.',
    });
    const course: CourseworkCourseDTO = await (
      await app.api(hira, `/api/coursework/courses/${awt._id}`)
    ).json();
    expect(course.assignments.find((a) => a.id === open.id)?.state).toBe('submitted');
    // One more piece of work waiting for a grade.
    expect(await toGrade()).toBe(waiting + 1);
  });
});

describe('materials', () => {
  it('teachers post files and links by week; only the class can open them', async () => {
    const imran = await app.login(ACCOUNTS.imran);
    const slides = await uploaded(imran, 'material', 'Week 2 - Express.pptx');
    const added = await send(imran, 'POST', `/api/teaching/courses/${awt._id}/materials`, {
      week: 2,
      title: 'Express routing slides',
      fileId: slides.id,
    });
    expect(added.status).toBe(201);
    await send(imran, 'POST', `/api/teaching/courses/${awt._id}/materials`, {
      week: 1,
      title: 'Socket.IO cheat sheet',
      url: 'https://socket.io/docs/v4/emit-cheatsheet/',
    });
    const script = await send(imran, 'POST', `/api/teaching/courses/${awt._id}/materials`, {
      week: 1,
      title: 'Bad link',
      url: 'javascript:alert(1)',
    });
    expect(script.status).toBe(400);

    const hira = await app.login(ACCOUNTS.hira);
    const course: CourseworkCourseDTO = await (
      await app.api(hira, `/api/coursework/courses/${awt._id}`)
    ).json();
    // Grouped by week (the demo course already has some), each with its file or link.
    const weeks = course.materials.map((m) => m.week);
    expect(weeks).toEqual([...weeks].sort((a, b) => a - b));
    expect(course.materials.find((m) => m.title === 'Socket.IO cheat sheet')).toMatchObject({
      week: 1,
      url: 'https://socket.io/docs/v4/emit-cheatsheet/',
      file: null,
    });
    expect(course.materials.find((m) => m.title === 'Express routing slides')?.file?.name).toBe(
      'Week 2 - Express.pptx',
    );
    expect((await app.api(hira, slides.url)).status).toBe(200);
    expect(
      (
        await send(hira, 'POST', `/api/teaching/courses/${awt._id}/materials`, {
          week: 3,
          title: 'Mine',
          url: 'https://example.com',
        })
      ).status,
    ).toBe(403);

    const usman = await app.login(ACCOUNTS.usman);
    expect((await app.api(usman, `/api/coursework/courses/${awt._id}`)).status).toBe(403);
    expect((await app.api(usman, slides.url)).status).toBe(404);
  });
});

describe('live quizzes', () => {
  const join = (socket: ClientSocket, quizId: string) =>
    socket.emitWithAck('quiz:join', { quizId });

  it('runs live: answers reach only the teacher, then everyone sees the answer', async () => {
    const imran = await app.login(ACCOUNTS.imran);
    const created = await send(imran, 'POST', `/api/teaching/courses/${awt._id}/quizzes`, {
      title: 'Rooms and namespaces',
      questions: [
        {
          text: 'Which call sends to everyone in a room except the sender?',
          options: ['io.emit', 'socket.to(room).emit', 'socket.emit'],
          correct: 1,
          points: 2,
          seconds: 20,
        },
        { text: 'Acknowledgements are callbacks.', options: ['True', 'False'], correct: 0 },
      ],
    });
    expect(created.status).toBe(201);
    const quiz: QuizViewDTO = await created.json();
    expect(quiz.questions?.map((q) => q.id)).toEqual(['q1', 'q2']);

    const hiraCookie = await app.login(ACCOUNTS.hira);
    expect((await app.api(hiraCookie, `/api/coursework/quizzes/${quiz.id}`)).status).toBe(404);

    const host = await app.connectWithCookie(imran);
    const hira = await app.connectWithCookie(hiraCookie);
    const ali = await app.connect(ACCOUNTS.ali);
    const usman = await app.connect(ACCOUNTS.usman);

    const told = nextEvent(hira, 'notification:new', (n) => n.title.startsWith('Live quiz'));
    expect((await send(imran, 'POST', `/api/teaching/quizzes/${quiz.id}/start`)).status).toBe(200);
    expect((await told).link).toBe(`/academics/quizzes/${quiz.id}`);

    expect(await join(host, quiz.id)).toMatchObject({ ok: true });
    const presence = nextEvent(host, 'quiz:presence', (p) => p.joined === 1);
    expect(await join(hira, quiz.id)).toEqual({ ok: true, data: { joined: 1 } });
    await presence;
    await join(ali, quiz.id);
    expect(await join(usman, quiz.id)).toMatchObject({ ok: false, code: 'FORBIDDEN' });

    const shown = nextEvent(hira, 'quiz:state', (s) => s.current === 0);
    await send(imran, 'POST', `/api/teaching/quizzes/${quiz.id}/next`);
    await shown;
    const before: QuizViewDTO = await (
      await app.api(hiraCookie, `/api/coursework/quizzes/${quiz.id}`)
    ).json();
    expect(before.question).toMatchObject({
      id: 'q1',
      correct: null,
      counts: null,
      revealed: false,
    });
    expect(before.question?.remainingMs).toBeGreaterThan(15_000);
    expect(before.questions).toBeNull();

    // Hira answers: the teacher sees the tally, classmates don't.
    const tally = nextEvent(host, 'quiz:tally', (t) => t.answered === 1);
    const quiet = noEvent(ali, 'quiz:tally');
    expect(
      await hira.emitWithAck('quiz:answer', { quizId: quiz.id, questionId: 'q1', choice: 1 }),
    ).toEqual({ ok: true, data: { questionId: 'q1', choice: 1 } });
    expect((await tally).counts).toEqual([0, 1, 0]);
    expect(await quiet).toBe(true);
    expect(
      await hira.emitWithAck('quiz:answer', { quizId: quiz.id, questionId: 'q1', choice: 0 }),
    ).toMatchObject({ ok: false, code: 'CONFLICT' });
    await ali.emitWithAck('quiz:answer', { quizId: quiz.id, questionId: 'q1', choice: 0 });

    const revealed = nextEvent(hira, 'quiz:state', (s) => s.revealed);
    await send(imran, 'POST', `/api/teaching/quizzes/${quiz.id}/reveal`);
    await revealed;
    const after: QuizViewDTO = await (
      await app.api(hiraCookie, `/api/coursework/quizzes/${quiz.id}`)
    ).json();
    expect(after.question).toMatchObject({ correct: 1, counts: [1, 1, 0], revealed: true });
    expect(after.mine).toMatchObject({ answers: { q1: 1 }, score: 2, rank: 1 });
    expect(after.leaderboard[0]).toMatchObject({ rank: 1, name: 'Hira Khan', score: 2 });

    const ahmed = await app.connect(ACCOUNTS.ahmed);
    expect(
      await ahmed.emitWithAck('quiz:answer', { quizId: quiz.id, questionId: 'q1', choice: 1 }),
    ).toMatchObject({ ok: false, message: 'Time is up for this question.' });

    await send(imran, 'POST', `/api/teaching/quizzes/${quiz.id}/next`);
    const ended = nextEvent(hira, 'quiz:state', (s) => s.status === 'ended');
    expect((await send(imran, 'POST', `/api/teaching/quizzes/${quiz.id}/end`)).status).toBe(200);
    await ended;
    expect(
      (await send(imran, 'PUT', `/api/teaching/quizzes/${quiz.id}`, { title: 'x', questions: [] }))
        .status,
    ).toBe(400);

    // The scores become an (unpublished) quiz column; absent students get 0.
    const saved = await send(imran, 'POST', `/api/teaching/quizzes/${quiz.id}/marks`);
    const { assessmentId } = await saved.json();
    const again = await (
      await send(imran, 'POST', `/api/teaching/quizzes/${quiz.id}/marks`)
    ).json();
    expect(again.assessmentId).toBe(assessmentId);
    const sheet: MarksSheetDTO = await (
      await app.api(imran, `/api/teaching/courses/${awt._id}/marks`)
    ).json();
    const column = sheet.assessments.findIndex((a) => a.id === assessmentId);
    expect(sheet.assessments[column]).toMatchObject({ type: 'quiz', total: 3, published: false });
    const hiraUser = await userBy(ACCOUNTS.hira);
    const ahmedUser = await userBy(ACCOUNTS.ahmed);
    expect(sheet.students.find((s) => s.student.id === String(hiraUser._id))?.marks[column]).toBe(
      2,
    );
    expect(sheet.students.find((s) => s.student.id === String(ahmedUser._id))?.marks[column]).toBe(
      0,
    );
  });

  it('closes a question as soon as every student has answered', async () => {
    const imran = await app.login(ACCOUNTS.imran);
    // Imran's Web Technologies class (BSE-5A): every student answers.
    const web = await CourseOffering.findOne({ code: 'CSC336' }).lean<CourseOfferingDoc>();
    if (!web) throw new Error('No CSC336');
    const quiz: QuizViewDTO = await (
      await send(imran, 'POST', `/api/teaching/courses/${web._id}/quizzes`, {
        title: 'Warm-up',
        questions: [{ text: 'HTTP is stateless.', options: ['True', 'False'], correct: 0 }],
      })
    ).json();
    await send(imran, 'POST', `/api/teaching/quizzes/${quiz.id}/start`);
    await send(imran, 'POST', `/api/teaching/quizzes/${quiz.id}/next`);
    const host = await app.connectWithCookie(imran);
    await join(host, quiz.id);
    const closed = nextEvent(host, 'quiz:state', (s) => s.revealed, 5000);
    const students = await User.find({ _id: { $in: web.studentIds } })
      .select('regNo')
      .lean();
    expect(students.length).toBeGreaterThan(0);
    for (const student of students) {
      const socket = await app.connect(student.regNo ?? '');
      await socket.emitWithAck('quiz:answer', { quizId: quiz.id, questionId: 'q1', choice: 0 });
    }
    expect((await closed).revealed).toBe(true);
  });
});
