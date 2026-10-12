import {
  EVALUATION_QUESTIONS,
  type EvaluationHomeDTO,
  type EvaluationReportDTO,
} from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EvaluationReceipt, EvaluationSheet } from '../src/models';
import { toObjectId } from '../src/services/mappers';
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

const BASE = '/api/academics/evaluation';
const HOD_EE = 'tariq.mahmood@comsats.edu.pk';
const all = (rating: number) => EVALUATION_QUESTIONS.map(() => rating);

const send = (cookie: string, method: string, path: string, body?: unknown) =>
  app.api(cookie, path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const home = async (identifier: string): Promise<EvaluationHomeDTO> =>
  (await app.api(await app.login(identifier), BASE)).json();

let awtId = '';

describe('teacher evaluation', () => {
  it('lets a student evaluate each course once, with nothing that points back to them', async () => {
    const mine = await home(ACCOUNTS.hira);
    expect(mine.open).toBe(true);
    expect(mine.courses.length).toBeGreaterThan(3);
    expect(mine.courses.every((c) => !c.done)).toBe(true);
    const awt = mine.courses.find((c) => c.code === 'CSC337');
    if (!awt) throw new Error('Hira has no CSC337');
    awtId = awt.offeringId;
    expect(awt.teacher?.name).toBe('Dr. Imran Haider');

    const hira = await app.login(ACCOUNTS.hira);
    const before = await EvaluationSheet.findById(awtId).lean();
    expect((await send(hira, 'POST', `${BASE}/${awtId}`, { ratings: all(9) })).status).toBe(400);
    const sent = await send(hira, 'POST', `${BASE}/${awtId}`, {
      ratings: all(5),
      wentWell: 'Loved the Socket.IO labs.',
    });
    expect(sent.status).toBe(201);
    expect((await send(hira, 'POST', `${BASE}/${awtId}`, { ratings: all(4) })).status).toBe(409);
    const after = await EvaluationSheet.findById(awtId).lean();
    expect(after?.responses.length).toBe((before?.responses.length ?? 0) + 1);

    // The answers carry no student id and no time; the receipt holds only the day.
    const student = await userBy(ACCOUNTS.hira);
    const raw = await EvaluationSheet.collection.findOne({ _id: toObjectId(awtId) });
    expect(JSON.stringify(raw)).not.toContain(String(student._id));
    expect(Object.keys(after?.responses[0] ?? {}).sort()).toEqual([
      'improve',
      'ratings',
      'wentWell',
    ]);
    const receipt = await EvaluationReceipt.findOne({
      studentId: student._id,
      offeringId: awtId,
    }).lean();
    expect(Object.keys(receipt ?? {}).sort()).toEqual([
      '_id',
      'day',
      'offeringId',
      'studentId',
      'termId',
    ]);
    // A random id, not an ObjectId (which would hold the second it was written).
    expect(receipt?._id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await home(ACCOUNTS.hira)).courses.find((c) => c.code === 'CSC337')?.done).toBe(true);

    // Only enrolled students; teachers can't answer for their own course.
    const usman = await app.login(ACCOUNTS.usman);
    expect((await send(usman, 'POST', `${BASE}/${awtId}`, { ratings: all(1) })).status).toBe(403);
    const imran = await app.login(ACCOUNTS.imran);
    expect((await send(imran, 'POST', `${BASE}/${awtId}`, { ratings: all(5) })).status).toBe(403);
  });

  it('hides results while open, then shows them only to the right people', async () => {
    const imranHome = await home(ACCOUNTS.imran);
    expect(imranHome.rows.length).toBeGreaterThan(0);
    expect(imranHome.rows.every((r) => r.teacher?.name === 'Dr. Imran Haider')).toBe(true);
    expect(imranHome.rows.every((r) => r.overall === null)).toBe(true);
    const imran = await app.login(ACCOUNTS.imran);
    const whileOpen: EvaluationReportDTO = await (
      await app.api(imran, `${BASE}/${awtId}/report`)
    ).json();
    expect(whileOpen.summary).toBeNull();
    expect(whileOpen.hiddenReason).toMatch(/when the evaluation closes/);
    expect((await app.api(await app.login(ACCOUNTS.hira), `${BASE}/${awtId}/report`)).status).toBe(
      403,
    );

    // The Director's Office closes it; the teacher hears the results are ready.
    const teacher = await app.connect(ACCOUNTS.imran);
    const ready = nextEvent(teacher, 'notification:new', (n) => n.type === 'evaluation');
    const director = await app.login(ACCOUNTS.director);
    expect((await send(imran, 'PUT', `${BASE}/window`, { open: false })).status).toBe(403);
    expect(await (await send(director, 'PUT', `${BASE}/window`, { open: false })).json()).toEqual({
      open: false,
    });
    expect((await ready).title).toBe('Your course evaluation results are ready');

    const report: EvaluationReportDTO = await (
      await app.api(imran, `${BASE}/${awtId}/report`)
    ).json();
    expect(report.hiddenReason).toBeNull();
    expect(report.responses).toBeGreaterThanOrEqual(3);
    expect(report.summary?.questions).toHaveLength(EVALUATION_QUESTIONS.length);
    expect(report.summary?.wentWell).toContain('Loved the Socket.IO labs.');
    expect((await home(ACCOUNTS.imran)).rows.find((r) => r.offeringId === awtId)?.overall).toBe(
      report.summary?.overall,
    );

    for (const [who, status] of [
      [ACCOUNTS.hodCS, 200],
      [ACCOUNTS.director, 200],
      [ACCOUNTS.admin, 200],
      [ACCOUNTS.fatima, 403],
      [HOD_EE, 403],
      [ACCOUNTS.exam, 403],
    ] as const) {
      expect((await app.api(await app.login(who), `${BASE}/${awtId}/report`)).status).toBe(status);
    }
    // Closed: no more answers.
    const hiraCourses = await home(ACCOUNTS.hira);
    const other = hiraCourses.courses.find((c) => !c.done);
    const hira = await app.login(ACCOUNTS.hira);
    const late = await send(hira, 'POST', `${BASE}/${other?.offeringId}`, { ratings: all(3) });
    expect(late.status).toBe(400);
    expect((await late.json()).error.message).toBe('Teacher evaluation is closed.');
  });

  it('keeps results hidden when fewer than three answered', async () => {
    const sheet = await EvaluationSheet.findById(awtId).lean();
    await EvaluationSheet.updateOne(
      { _id: awtId },
      { $set: { responses: (sheet?.responses ?? []).slice(0, 2) } },
    );
    const imran = await app.login(ACCOUNTS.imran);
    const report: EvaluationReportDTO = await (
      await app.api(imran, `${BASE}/${awtId}/report`)
    ).json();
    expect(report.summary).toBeNull();
    expect(report.hiddenReason).toMatch(/^Only 2 answered\. Results need at least 3 answers/);
  });

  it('tells students when evaluation opens', async () => {
    const student = await app.connect(ACCOUNTS.hira);
    const told = nextEvent(student, 'notification:new', (n) => n.type === 'evaluation');
    const director = await app.login(ACCOUNTS.director);
    await send(director, 'PUT', `${BASE}/window`, { open: true });
    expect(await told).toMatchObject({
      title: 'Teacher evaluation for Fall 2026 is open',
      link: '/academics/evaluation',
    });
  });
});
