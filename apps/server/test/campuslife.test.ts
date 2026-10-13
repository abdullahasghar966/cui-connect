import {
  addDays,
  campusClock,
  campusInstant,
  type FileDTO,
  type JobDTO,
  type JobsHomeDTO,
  type LostItemDTO,
} from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Notification } from '../src/models';
import { resetReminderMemory, runReminders } from '../src/services/reminders';
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

const AFFAIRS = 'student.affairs@comsats.edu.pk';
const MEHWISH = 'FA23-BEE-002';
const ZAINAB = 'FA23-BCS-004';
const today = () => campusClock().date;

const send = (cookie: string, method: string, path: string, body?: unknown) =>
  app.api(cookie, path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const jobs = async (identifier: string): Promise<JobsHomeDTO> =>
  (await app.api(await app.login(identifier), '/api/campus/jobs')).json();

const job = (overrides: Record<string, unknown> = {}) => ({
  title: 'Backend Intern',
  company: 'Kahuta Cloud',
  kind: 'internship',
  location: 'Islamabad',
  description: 'Node.js, MongoDB and queues for a logistics platform.',
  applyUrl: 'https://careers.example.com/kahuta/backend',
  deadline: addDays(today(), 14),
  programs: ['BCS'],
  ...overrides,
});

// A 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const upload = (cookie: string, name: string, bytes = PNG) =>
  app.api(cookie, '/api/files?purpose=lostfound', {
    method: 'POST',
    body: bytes,
    headers: {
      'content-type': 'application/octet-stream',
      'x-file-name': encodeURIComponent(name),
    },
  });

describe('jobs board', () => {
  it('lets Student Affairs post jobs with a safe way to apply; students of the programme are told', async () => {
    const mine = await jobs(ACCOUNTS.hira);
    expect(mine.canManage).toBe(false);
    expect(mine.closed).toEqual([]);
    expect(mine.open.find((j) => j.company === 'Margalla Software House')?.saved).toBe(true);
    expect(mine.open.some((j) => j.company === 'Rawal Digital')).toBe(false);

    const hira = await app.login(ACCOUNTS.hira);
    expect((await send(hira, 'POST', '/api/campus/jobs', job())).status).toBe(403);
    const affairs = await app.login(AFFAIRS);
    for (const bad of [
      { applyUrl: 'javascript:alert(1)' },
      { applyUrl: null, applyEmail: null },
      { deadline: addDays(today(), -1) },
    ]) {
      expect((await send(affairs, 'POST', '/api/campus/jobs', job(bad))).status).toBe(400);
    }

    const student = await app.connect(ACCOUNTS.hira);
    const other = await app.connect(MEHWISH);
    const told = nextEvent(student, 'notification:new', (n) => n.type === 'campus');
    const notTold = noEvent(other, 'notification:new', (n) => n.type === 'campus');
    const posted = await send(affairs, 'POST', '/api/campus/jobs', job());
    expect(posted.status).toBe(201);
    const dto: JobDTO = await posted.json();
    expect((await told).title).toBe('New internship: Backend Intern at Kahuta Cloud');
    expect(await notTold).toBe(true);

    expect((await send(affairs, 'POST', `/api/campus/jobs/${dto.id}/close`)).status).toBe(200);
    expect((await jobs(ACCOUNTS.hira)).open.some((j) => j.id === dto.id)).toBe(false);
    expect((await jobs(AFFAIRS)).closed.some((j) => j.id === dto.id)).toBe(true);
  });

  it('reminds people who saved a job two days before its deadline', async () => {
    resetReminderMemory();
    const potohar = (await jobs(ACCOUNTS.usman)).open.find((j) => j.company === 'Potohar Fintech');
    if (!potohar) throw new Error('No Potohar post');
    const usman = await app.login(ACCOUNTS.usman);
    const saved: JobDTO = await (
      await send(usman, 'PUT', `/api/campus/jobs/${potohar.id}/saved`, { saved: true })
    ).json();
    expect(saved.saved).toBe(true);
    expect((await jobs(ACCOUNTS.usman)).saved.map((j) => j.id)).toContain(potohar.id);

    await runReminders(campusInstant(addDays(potohar.deadline, -2), '08:10'));
    const user = await userBy(ACCOUNTS.usman);
    expect(
      await Notification.exists({ userId: user._id, title: /^Apply by .*: Data Analyst Intern$/ }),
    ).toBeTruthy();
  });
});

describe('lost & found', () => {
  it('shows a report’s photo to everyone once it is on the report, and passes answers to the reporter', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const usman = await app.login(ACCOUNTS.usman);
    expect((await upload(hira, 'receipt.pdf', Buffer.from('%PDF-1.4'))).status).toBe(400);
    const photoRes = await upload(hira, 'earbuds.png');
    expect(photoRes.status).toBe(201);
    const photo: FileDTO = await photoRes.json();
    // Not on a report yet: only Hira can open it.
    expect((await app.api(usman, photo.url)).status).toBe(404);

    const created = await send(hira, 'POST', '/api/campus/lost-found', {
      kind: 'lost',
      title: 'Wireless earbuds case',
      category: 'electronics',
      place: 'Lab 2, Academic Block II',
      date: today(),
      photoId: photo.id,
    });
    expect(created.status).toBe(201);
    const item: LostItemDTO = await created.json();
    expect(item.photo?.id).toBe(photo.id);
    expect((await app.api(usman, photo.url)).status).toBe(200);

    const reporter = await app.connect(ACCOUNTS.hira);
    const told = nextEvent(reporter, 'notification:new', (n) => n.type === 'campus');
    const claim = await send(usman, 'POST', `/api/campus/lost-found/${item.id}/claims`, {
      message: 'I found a white case in Lab 2 yesterday evening.',
    });
    expect(claim.status).toBe(200);
    expect((await told).title).toBe('Usman Tariq may have found your wireless earbuds case');
    expect(
      (
        await send(usman, 'POST', `/api/campus/lost-found/${item.id}/claims`, {
          message: 'Again, mine.',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await send(hira, 'POST', `/api/campus/lost-found/${item.id}/claims`, {
          message: 'My own one.',
        })
      ).status,
    ).toBe(400);

    // Answers are for the reporter (and Student Affairs); the person answering sees only theirs.
    const theirView: LostItemDTO = await (
      await app.api(usman, `/api/campus/lost-found/${item.id}`)
    ).json();
    expect(theirView.claims).toBeNull();
    expect(theirView.myClaim?.message).toMatch(/white case/);
    const ownerView: LostItemDTO = await (
      await app.api(hira, `/api/campus/lost-found/${item.id}`)
    ).json();
    expect(ownerView.claims?.map((c) => c.user.name)).toEqual(['Usman Tariq']);

    const zainab = await app.login(ZAINAB);
    expect(
      (await send(zainab, 'POST', `/api/campus/lost-found/${item.id}/resolve`, {})).status,
    ).toBe(403);
    const finder = await app.connect(ACCOUNTS.usman);
    const thanked = nextEvent(finder, 'notification:new', (n) => n.type === 'campus');
    const resolved: LostItemDTO = await (
      await send(hira, 'POST', `/api/campus/lost-found/${item.id}/resolve`, {
        claimId: ownerView.claims?.[0]?.id,
      })
    ).json();
    expect(resolved.resolved).toBe(true);
    expect((await thanked).title).toBe('Thank you: Wireless earbuds case is back with its owner');
  });

  it('lets Student Affairs close anyone’s report (the reporter is told) and reporters remove their own', async () => {
    const ahmedHome = await (
      await app.api(await app.login(ACCOUNTS.ahmed), '/api/campus/lost-found')
    ).json();
    const bottle = (ahmedHome.mine as LostItemDTO[]).find(
      (i) => i.title === 'Blue steel water bottle',
    );
    if (!bottle) throw new Error('No bottle report');
    const ahmed = await app.connect(ACCOUNTS.ahmed);
    const told = nextEvent(
      ahmed,
      'notification:new',
      (n) => n.title === 'Closed: Blue steel water bottle',
    );
    const affairs = await app.login(AFFAIRS);
    expect(
      (await send(affairs, 'POST', `/api/campus/lost-found/${bottle.id}/resolve`, {})).status,
    ).toBe(200);
    await told;

    const hira = await app.login(ACCOUNTS.hira);
    const report: LostItemDTO = await (
      await send(hira, 'POST', '/api/campus/lost-found', {
        kind: 'found',
        title: 'Grey scarf',
        category: 'clothing',
        place: 'Bus stop',
        date: today(),
      })
    ).json();
    const usman = await app.login(ACCOUNTS.usman);
    expect((await send(usman, 'DELETE', `/api/campus/lost-found/${report.id}`)).status).toBe(403);
    expect((await send(hira, 'DELETE', `/api/campus/lost-found/${report.id}`)).status).toBe(200);
    expect((await app.api(hira, `/api/campus/lost-found/${report.id}`)).status).toBe(404);
  });
});
