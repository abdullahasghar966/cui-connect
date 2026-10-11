import type { MarksSheetDTO, MyResultsDTO } from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CourseOffering, Section } from '../src/models';
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

async function offeringId(code: string, sectionName: string): Promise<string> {
  const section = await Section.findOne({ name: sectionName }).lean();
  const offering = await CourseOffering.findOne({ code, sectionId: section?._id }).lean();
  if (!offering) throw new Error(`No ${code} for ${sectionName}`);
  return String(offering._id);
}

const results = async (cookie: string): Promise<MyResultsDTO> =>
  (await app.api(cookie, '/api/academics/results')).json();

const sheet = async (cookie: string, id: string): Promise<MarksSheetDTO> =>
  (await app.api(cookie, `/api/teaching/courses/${id}/marks`)).json();

describe('results for students', () => {
  it('shows only published marks, a projected grade and the official CGPA', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const mine = await results(hira);
    expect(mine.term.code).toBe('FA26');
    expect(mine.courses).toHaveLength(5);
    const awt = mine.courses.find((c) => c.course.code === 'CSC337');
    const titles = awt?.assessments.map((a) => a.title) ?? [];
    expect(titles).toEqual(expect.arrayContaining(['Quiz 1', 'Assignment 1', 'Sessional I']));
    expect(titles).not.toContain('Quiz 3'); // marked but not published yet
    expect(awt?.projected?.grade).toMatch(/^[A-F][+-]?$/);
    expect(awt?.assessments[0]?.classAverage).not.toBeNull();
    expect(mine.projectedGpa).toBeGreaterThan(2);

    // Six earlier semesters, newest first, each with a GPA.
    expect(mine.history.map((t) => t.term.code)).toEqual([
      'SP26',
      'FA25',
      'SP25',
      'FA24',
      'SP24',
      'FA23',
    ]);
    expect(mine.cgpa).toBeGreaterThan(2.5);
    expect(mine.cgpa).toBeLessThanOrEqual(4);
    expect(mine.creditsEarned).toBeGreaterThan(80);
  });

  it('counts only the latest attempt of a failed course in the CGPA', async () => {
    const ahmed = await app.login(ACCOUNTS.ahmed);
    const his = await results(ahmed);
    const grade = (term: string) =>
      his.history.find((t) => t.term.code === term)?.courses.find((c) => c.code === 'CSC211');
    expect(grade('FA24')?.grade).toBe('F');
    expect(grade('SP25')?.grade).toBe('C+');
    const all = his.history.flatMap((t) => t.courses);
    const withoutFailed = all.filter((c) => !(c.code === 'CSC211' && c.grade === 'F'));
    const credits = withoutFailed.reduce((s, c) => s + c.credits, 0);
    const points = withoutFailed.reduce((s, c) => s + c.points * c.credits, 0);
    expect(his.cgpa).toBe(Math.round((points / credits) * 100) / 100);
  });

  it("keeps everyone else's marks private", async () => {
    const awt = await offeringId('CSC337', 'BCS-7A');
    const hira = await app.login(ACCOUNTS.hira);
    expect((await app.api(hira, `/api/teaching/courses/${awt}/marks`)).status).toBe(403);
    const sana = await app.login(ACCOUNTS.sana);
    expect((await app.api(sana, `/api/teaching/courses/${awt}/marks`)).status).toBe(403);
    // The HOD and the Examination Office may look, but not change anything.
    const hod = await app.login(ACCOUNTS.hodCS);
    const asHod = await sheet(hod, awt);
    expect(asHod.canManage).toBe(false);
    expect(asHod.students).toHaveLength(6);
    expect(
      (
        await send(hod, 'POST', `/api/teaching/courses/${awt}/assessments`, {
          type: 'quiz',
          title: 'Surprise quiz',
          total: 5,
        })
      ).status,
    ).toBe(403);
    const exam = await app.login(ACCOUNTS.exam);
    expect((await app.api(exam, `/api/teaching/courses/${awt}/marks`)).status).toBe(200);
  });
});

describe('the marks grid', () => {
  it('adds an assessment, checks marks against the total, and announces it once', async () => {
    const awt = await offeringId('CSC337', 'BCS-7A');
    const imran = await app.login(ACCOUNTS.imran);
    const before = await sheet(imran, awt);
    expect(before.canManage).toBe(true);
    expect(before.assessments.find((a) => a.title === 'Quiz 3')?.published).toBe(false);

    const created = await send(imran, 'POST', `/api/teaching/courses/${awt}/assessments`, {
      type: 'assignment',
      title: 'Assignment 2',
      total: 20,
      date: '2026-10-09',
    });
    expect(created.status).toBe(201);
    const assignment = await created.json();

    const hiraUser = await userBy(ACCOUNTS.hira);
    const aliUser = await userBy(ACCOUNTS.ali);
    const tooMany = await send(imran, 'PUT', `/api/teaching/assessments/${assignment.id}/marks`, {
      marks: [{ studentId: String(aliUser._id), obtained: 25 }],
    });
    expect(tooMany.status).toBe(400);
    const outsider = await userBy(ACCOUNTS.usman);
    expect(
      (
        await send(imran, 'PUT', `/api/teaching/assessments/${assignment.id}/marks`, {
          marks: [{ studentId: String(outsider._id), obtained: 10 }],
        })
      ).status,
    ).toBe(400);

    const marks = before.students.map((s, i) => ({
      studentId: s.student.id,
      obtained: s.student.id === String(hiraUser._id) ? 18 : 10 + i,
    }));
    const saved = await send(imran, 'PUT', `/api/teaching/assessments/${assignment.id}/marks`, {
      marks,
    });
    expect(await saved.json()).toEqual({ saved: 6 });

    // Not published yet: students can't see it.
    const hira = await app.login(ACCOUNTS.hira);
    const hidden = (await results(hira)).courses.find((c) => c.course.code === 'CSC337');
    expect(hidden?.assessments.map((a) => a.title)).not.toContain('Assignment 2');

    const hiraSocket = await app.connect(ACCOUNTS.hira);
    const usmanSocket = await app.connect(ACCOUNTS.usman);
    const announced = nextEvent(hiraSocket, 'notification:new', (n) => n.type === 'results');
    const quiet = noEvent(usmanSocket, 'notification:new');
    await send(imran, 'POST', `/api/teaching/assessments/${assignment.id}/publish`);
    const notification = await announced;
    expect(notification.title).toBe('Advanced Web Technologies Assignment 2 marks are out');
    expect(notification.body).toMatch(/^You scored 18\/20\. Class average: \d+(\.\d)?\.$/);
    expect(await quiet).toBe(true);

    const visible = (await results(hira)).courses.find((c) => c.course.code === 'CSC337');
    expect(visible?.assessments.find((a) => a.title === 'Assignment 2')?.obtained).toBe(18);

    // Hiding and publishing again doesn't announce it twice.
    await send(imran, 'POST', `/api/teaching/assessments/${assignment.id}/unpublish`);
    const again = noEvent(hiraSocket, 'notification:new');
    await send(imran, 'POST', `/api/teaching/assessments/${assignment.id}/publish`);
    expect(await again).toBe(true);

    // A correction after publishing is announced to that student only.
    const corrected = nextEvent(hiraSocket, 'notification:new', (n) =>
      n.title.startsWith('Mark updated'),
    );
    await send(imran, 'PUT', `/api/teaching/assessments/${assignment.id}/marks`, {
      marks: [{ studentId: String(hiraUser._id), obtained: 19.5 }],
    });
    expect((await corrected).body).toBe('You scored 19.5/20.');

    // The total can't drop below a mark already given.
    expect(
      (
        await send(imran, 'PUT', `/api/teaching/assessments/${assignment.id}`, {
          type: 'assignment',
          title: 'Assignment 2',
          total: 15,
        })
      ).status,
    ).toBe(400);
  });

  it('only lets the course teacher add assessments', async () => {
    const awt = await offeringId('CSC337', 'BCS-7A');
    const fatima = await app.login(ACCOUNTS.fatima);
    const res = await send(fatima, 'POST', `/api/teaching/courses/${awt}/assessments`, {
      type: 'quiz',
      title: 'Quiz X',
      total: 10,
    });
    expect(res.status).toBe(403);
  });
});

describe('grading and final results', () => {
  it('needs weights that add up to 100 and every part marked before finalising', async () => {
    const awt = await offeringId('CSC337', 'BCS-7A');
    const imran = await app.login(ACCOUNTS.imran);
    const weights = {
      quiz: 20,
      assignment: 20,
      sessional1: 50,
      sessional2: 0,
      terminal: 0,
      lab: 0,
      project: 0,
    };
    const bad = await send(imran, 'PUT', `/api/teaching/courses/${awt}/grading`, {
      weights: { ...weights, sessional1: 40 },
    });
    expect(bad.status).toBe(400);

    // With the campus default, Sessional II and the terminal exam aren't marked yet.
    const early = await send(imran, 'POST', `/api/teaching/courses/${awt}/finalize`);
    expect(early.status).toBe(400);
    expect((await early.json()).error.message).toMatch(/Sessional II, Terminal exam/);

    const set = await send(imran, 'PUT', `/api/teaching/courses/${awt}/grading`, {
      weights: { ...weights, sessional1: 60 },
    });
    expect(set.status).toBe(200);

    const hiraSocket = await app.connect(ACCOUNTS.hira);
    const finalGrade = nextEvent(hiraSocket, 'notification:new', (n) =>
      n.title.startsWith('Final grade for Advanced Web Technologies'),
    );
    const done = await send(imran, 'POST', `/api/teaching/courses/${awt}/finalize`);
    expect(await done.json()).toEqual({ finalized: 6 });
    expect((await finalGrade).body).toMatch(/Your CGPA is now \d\.\d\d\./);

    const hira = await app.login(ACCOUNTS.hira);
    const mine = await results(hira);
    const awtResult = mine.courses.find((c) => c.course.code === 'CSC337');
    expect(awtResult?.final?.grade).toMatch(/^[A-F][+-]?$/);
    expect(mine.history[0]?.term.code).toBe('FA26');
    expect(mine.history[0]?.courses.map((c) => c.code)).toEqual(['CSC337']);
    const teacherView = await sheet(imran, awt);
    expect(teacherView.finalizedAt).not.toBeNull();
    expect(teacherView.students.every((s) => s.final !== null)).toBe(true);
  });
});
