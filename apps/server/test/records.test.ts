import type { DegreeProgressDTO, TranscriptDTO } from '@cui/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, startTestApp, type TestApp, userBy } from './helpers';

let app: TestApp;

beforeAll(async () => {
  app = await startTestApp();
});

afterAll(async () => {
  await app?.close();
});

describe('transcript and degree progress', () => {
  it('builds a transcript from final results, oldest term first', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const mine: TranscriptDTO = await (await app.api(hira, '/api/academics/transcript')).json();
    expect(mine.student).toMatchObject({
      name: 'Hira Khan',
      regNo: 'FA23-BCS-002',
      programName: 'BS Computer Science',
      intake: 'FA23',
    });
    expect(mine.terms.map((t) => t.term.code)).toEqual([
      'FA23',
      'SP24',
      'FA24',
      'SP25',
      'FA25',
      'SP26',
    ]);
    expect(mine.creditsRequired).toBe(133);
    const results = await (await app.api(hira, '/api/academics/results')).json();
    expect(mine.cgpa).toBe(results.cgpa);
    expect(mine.creditsEarned).toBe(results.creditsEarned);
  });

  it('shows the degree plan with passed, retaken, current and planned courses', async () => {
    const ahmed = await app.login(ACCOUNTS.ahmed);
    const progress: DegreeProgressDTO = await (
      await app.api(ahmed, '/api/academics/progress')
    ).json();
    expect(progress.program?.code).toBe('BCS');
    expect(progress.currentSemester).toBe(7);
    const all = progress.semesters.flatMap((s) => s.courses);
    // Failed in FA24, passed in SP25: the latest attempt counts.
    expect(all.find((c) => c.code === 'CSC211')).toMatchObject({
      status: 'passed',
      grade: 'C+',
      term: 'SP25',
    });
    const seventh = progress.semesters.find((s) => s.semester === 7);
    expect(seventh?.courses.every((c) => c.status === 'current')).toBe(true);
    const eighth = progress.semesters.find((s) => s.semester === 8);
    expect(eighth?.courses.every((c) => c.status === 'planned')).toBe(true);
    expect(progress.creditsInProgress).toBeGreaterThan(10);
  });

  it('opens a record only for the student and the people responsible for them', async () => {
    const hira = await userBy(ACCOUNTS.hira);
    const path = `/api/academics/transcript?studentId=${hira._id}`;
    const status = async (account: string) =>
      (await app.api(await app.login(account), path)).status;
    expect(await status(ACCOUNTS.imran)).toBe(200); // teaches her
    expect(await status(ACCOUNTS.hodCS)).toBe(200);
    expect(await status(ACCOUNTS.exam)).toBe(200);
    expect(await status(ACCOUNTS.admin)).toBe(200);
    expect(await status(ACCOUNTS.usman)).toBe(403); // another student
    expect(await status(ACCOUNTS.sana)).toBe(403); // an EE teacher with no link
    expect(await status(ACCOUNTS.director)).toBe(403);

    // Staff without a student chosen get a clear message, not someone's record.
    const exam = await app.login(ACCOUNTS.exam);
    expect((await app.api(exam, '/api/academics/transcript')).status).toBe(404);
  });

  it('looks up only the students a person may open', async () => {
    const lookup = async (account: string, q: string) =>
      (await app.api(await app.login(account), `/api/academics/records/students?q=${q}`)).json();
    expect((await lookup(ACCOUNTS.imran, 'hira')).map((s: { name: string }) => s.name)).toEqual([
      'Hira Khan',
    ]);
    // Dr. Imran teaches no EE students.
    expect(await lookup(ACCOUNTS.imran, 'FA23-BEE')).toEqual([]);
    expect((await lookup(ACCOUNTS.exam, 'FA23-BEE')).length).toBeGreaterThan(0);
    expect(await lookup(ACCOUNTS.hira, 'ali')).toEqual([]);
  });
});
