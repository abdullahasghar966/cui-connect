import type { ExamDTO, ExamOptionsDTO, MyExamDTO, SeatingChartDTO } from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Room } from '../src/models';
import { ACCOUNTS, nextEvent, noEvent, startTestApp, type TestApp } from './helpers';

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

const options = async (cookie: string): Promise<ExamOptionsDTO> =>
  (await app.api(cookie, '/api/exams/options')).json();

const course = (o: ExamOptionsDTO, code: string) => {
  const found = o.courses.find((c) => c.code === code);
  if (!found) throw new Error(`No ${code}`);
  return found;
};

const paper = (o: ExamOptionsDTO, code: string, extra: Record<string, unknown> = {}) => ({
  kind: 'terminal',
  code,
  offeringIds: course(o, code).offerings.map((x) => x.offeringId),
  date: '2026-12-14',
  start: '09:00',
  end: '12:00',
  roomIds: [],
  ...extra,
});

describe('the seeded date sheets', () => {
  it('gives each student their papers with a seat, and never two papers at once', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const mine: MyExamDTO[] = await (await app.api(hira, '/api/exams/mine')).json();
    const second = mine.filter((e) => e.kind === 'sessional2');
    expect(second).toHaveLength(5);
    expect(second.every((e) => e.seat !== null)).toBe(true);
    expect(second[0]?.seat?.row).toBeGreaterThan(0);
    for (const a of mine) {
      for (const b of mine) {
        if (a.id === b.id || a.date !== b.date) continue;
        expect(a.end <= b.start || b.end <= a.start).toBe(true);
      }
    }

    const imran = await app.login(ACCOUNTS.imran);
    const his: MyExamDTO[] = await (await app.api(imran, '/api/exams/mine')).json();
    const awt = his.find((e) => e.code === 'CSC337' && e.kind === 'sessional2');
    expect(awt?.sections).toEqual(['BCS-7A']);
    expect(awt?.seat).toBeNull();
  });

  it('mixes sections so classmates do not sit side by side', async () => {
    const exam = await app.login(ACCOUNTS.exam);
    const list: ExamDTO[] = await (await app.api(exam, '/api/exams?kind=sessional2')).json();
    const shared = list.find((e) => e.sections.length > 1);
    expect(shared).toBeTruthy();
    const chart: SeatingChartDTO = await (
      await app.api(exam, `/api/exams/${shared?.id}/seating`)
    ).json();
    expect(chart.unseated).toBe(0);
    const firstRoom = chart.rooms[0];
    const row = firstRoom?.seats.filter((s) => s.row === 1) ?? [];
    for (let i = 1; i < row.length; i++) {
      expect(row[i]?.student.sectionName).not.toBe(row[i - 1]?.student.sectionName);
    }
  });
});

describe('the Examination Office', () => {
  it('refuses a paper that puts a student in two places, or double-books a room', async () => {
    const exam = await app.login(ACCOUNTS.exam);
    const o = await options(exam);
    const room = o.rooms[0]?.id as string;
    const created = await send(exam, 'POST', '/api/exams', paper(o, 'CSC337', { roomIds: [room] }));
    expect(created.status).toBe(201);

    // BCS-7A takes CSC337 and CSC441: the same morning is refused.
    const clash = await send(exam, 'POST', '/api/exams', paper(o, 'CSC441'));
    expect(clash.status).toBe(409);
    expect((await clash.json()).error.message).toMatch(/students? also sits? CSC337/);

    // An EE paper with different students can't use the same room at the same time.
    const ee = o.courses.find((c) => c.offerings.every((x) => x.sectionName === 'BEE-7A'));
    const check = await (
      await send(exam, 'POST', '/api/exams/check', paper(o, ee?.code ?? '', { roomIds: [room] }))
    ).json();
    expect(check.blocking.join(' ')).toMatch(/is already used for CSC337/);
    // Without a room it's fine, with a warning.
    const fine = await (
      await send(exam, 'POST', '/api/exams/check', paper(o, ee?.code ?? ''))
    ).json();
    expect(fine.blocking).toEqual([]);
    expect(fine.warnings[0]).toMatch(/No room chosen/);

    // A second terminal paper for the same course is refused.
    const twice = await send(
      exam,
      'POST',
      '/api/exams',
      paper(o, 'CSC337', { date: '2026-12-15' }),
    );
    expect(twice.status).toBe(409);
  });

  it('is the only office that edits the date sheet', async () => {
    const imran = await app.login(ACCOUNTS.imran);
    const hira = await app.login(ACCOUNTS.hira);
    expect((await app.api(imran, '/api/exams')).status).toBe(403);
    expect((await app.api(hira, '/api/exams/options')).status).toBe(403);
    const exam = await app.login(ACCOUNTS.exam);
    const o = await options(exam);
    expect((await send(imran, 'POST', '/api/exams', paper(o, 'CSC455'))).status).toBe(403);
    // IT can help.
    const admin = await app.login(ACCOUNTS.admin);
    expect((await app.api(admin, '/api/exams')).status).toBe(200);
  });

  it('publishes a date sheet to each student once, then announces seats and changes', async () => {
    const exam = await app.login(ACCOUNTS.exam);
    const list: ExamDTO[] = await (await app.api(exam, '/api/exams?kind=terminal')).json();
    const awt = list.find((e) => e.code === 'CSC337') as ExamDTO;
    expect(awt.published).toBe(false);

    // Unpublished papers are invisible to students.
    const hira = await app.login(ACCOUNTS.hira);
    const before: MyExamDTO[] = await (await app.api(hira, '/api/exams/mine')).json();
    expect(before.some((e) => e.kind === 'terminal')).toBe(false);

    const hiraSocket = await app.connect(ACCOUNTS.hira);
    const mehwishSocket = await app.connect(ACCOUNTS.mehwish);
    const sheet = nextEvent(hiraSocket, 'notification:new', (n) => n.type === 'exams');
    const quiet = noEvent(mehwishSocket, 'notification:new');
    await send(exam, 'POST', '/api/exams/publish', { kind: 'terminal' });
    const published = await sheet;
    expect(published.title).toBe('The Terminal exam date sheet is out');
    expect(published.body).toMatch(/You have 1 paper, starting Mon 14 Dec, 9:00 AM/);
    expect(await quiet).toBe(true);

    const again = noEvent(hiraSocket, 'notification:new');
    await send(exam, 'POST', '/api/exams/publish', { kind: 'terminal' });
    expect(await again).toBe(true);

    const seated = nextEvent(hiraSocket, 'notification:new', (n) =>
      n.title.startsWith('Your seat'),
    );
    const seats = await (await send(exam, 'POST', `/api/exams/${awt.id}/seats`)).json();
    expect(seats).toEqual({ seated: awt.students, unseated: 0 });
    expect((await seated).body).toMatch(/^A-10\d, row \d+, seat \d+ · Mon 14 Dec/);

    const moved = nextEvent(hiraSocket, 'notification:new', (n) =>
      n.title.startsWith('Exam changed'),
    );
    const o = await options(exam);
    const res = await send(
      exam,
      'PUT',
      `/api/exams/${awt.id}`,
      paper(o, 'CSC337', { date: '2026-12-16', roomIds: awt.rooms.map((r) => r.id) }),
    );
    expect(res.status).toBe(200);
    expect((await moved).body).toBe('Now Wed 16 Dec, 9:00 AM – 12:00 PM.');

    const after: MyExamDTO[] = await (await app.api(hira, '/api/exams/mine')).json();
    const terminal = after.find((e) => e.kind === 'terminal');
    expect(terminal?.date).toBe('2026-12-16');
    expect(terminal?.seat).not.toBeNull(); // same rooms: the seat stays

    // Teachers of the paper can print its seating chart; others can't.
    const imran = await app.login(ACCOUNTS.imran);
    expect((await app.api(imran, `/api/exams/${awt.id}/seating`)).status).toBe(200);
    const sana = await app.login(ACCOUNTS.sana);
    expect((await app.api(sana, `/api/exams/${awt.id}/seating`)).status).toBe(403);
    expect((await app.api(hira, `/api/exams/${awt.id}/seating`)).status).toBe(403);
  });

  it('keeps rooms with papers from being deleted', async () => {
    const admin = await app.login(ACCOUNTS.admin);
    const hall = await (
      await send(admin, 'POST', '/api/admin/rooms', {
        name: 'Exam Hall 1',
        block: 'Library',
        kind: 'hall',
        capacity: 120,
        examRows: 10,
        examCols: 12,
      })
    ).json();
    const exam = await app.login(ACCOUNTS.exam);
    const o = await options(exam);
    expect(o.rooms.map((r) => r.name)).toContain('Exam Hall 1');
    const created = await send(
      exam,
      'POST',
      '/api/exams',
      paper(o, 'CSC455', { date: '2026-12-18', roomIds: [hall.id] }),
    );
    expect(created.status).toBe(201);
    const res = await send(admin, 'DELETE', `/api/admin/rooms/${hall.id}`);
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toMatch(/booked for exams/);
    expect(await Room.exists({ _id: hall.id })).toBeTruthy();
  });
});
