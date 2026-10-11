import { type MessageHitDTO, type TeacherDTO, timesOverlap } from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ClassSlot, Membership } from '../src/models';
import { ACCOUNTS, clientId, startTestApp, type TestApp, userBy } from './helpers';

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

describe('teacher directory', () => {
  it('lists office hours, courses, and offers a message only where the DM rules allow', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const list: TeacherDTO[] = await (
      await app.api(hira, '/api/academics/teachers/directory')
    ).json();
    const imran = list.find((t) => t.user.name === 'Dr. Imran Haider');
    const sana = list.find((t) => t.user.name.includes('Sana Javed'));
    expect(imran?.canMessage).toBe(true); // he teaches her
    expect(sana?.canMessage).toBe(false); // an EE teacher she has no link with
    expect(imran?.officeLocation).toMatch(/^Faculty Block CS, Room \d+$/);
    expect(imran?.officeHours).toHaveLength(2);
    expect(imran?.courses.map((c) => `${c.code} ${c.sectionName}`)).toContain('CSC337 BCS-7A');

    // Office hours never clash with the teacher's own classes.
    const teacher = await userBy(ACCOUNTS.imran);
    const slots = await ClassSlot.find({ instructorId: teacher._id }).lean();
    for (const h of imran?.officeHours ?? []) {
      expect(
        slots.some((s) => s.day === h.day && timesOverlap(s.start, s.end, h.start, h.end)),
      ).toBe(false);
    }

    const found: TeacherDTO[] = await (
      await app.api(hira, '/api/academics/teachers/directory?q=imran')
    ).json();
    expect(found.map((t) => t.user.name)).toEqual(['Dr. Imran Haider']);
  });

  it('lets teachers update their own office details only', async () => {
    const imran = await app.login(ACCOUNTS.imran);
    const saved = await send(imran, 'PUT', '/api/academics/me/office', {
      officeLocation: 'Faculty Block CS, Room 214',
      officeHours: [{ day: 2, start: '14:00', end: '15:00' }],
    });
    expect(await saved.json()).toMatchObject({
      officeLocation: 'Faculty Block CS, Room 214',
      officeHours: [{ day: 2, start: '14:00', end: '15:00' }],
    });
    const backwards = await send(imran, 'PUT', '/api/academics/me/office', {
      officeLocation: null,
      officeHours: [{ day: 2, start: '15:00', end: '14:00' }],
    });
    expect(backwards.status).toBe(400);
    const hira = await app.login(ACCOUNTS.hira);
    const student = await send(hira, 'PUT', '/api/academics/me/office', {
      officeLocation: 'Library',
      officeHours: [],
    });
    expect(student.status).toBe(400);
  });
});

describe('search', () => {
  it('finds courses, teachers and rooms in one query', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const web = await (await app.api(hira, '/api/search?q=web')).json();
    expect(web.courses.map((c: { code: string }) => c.code)).toEqual(['CSC336', 'CSC337']);
    const imran = await (await app.api(hira, '/api/search?q=imran')).json();
    expect(imran.teachers[0]).toMatchObject({ name: 'Dr. Imran Haider', departmentCode: 'CS' });
    const lab = await (await app.api(hira, '/api/search?q=lab')).json();
    expect(lab.rooms.length).toBeGreaterThan(0);
    expect((await app.api(hira, '/api/search?q=a')).status).toBe(400);
  });

  it('searches messages only in chats the person may read', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const hits: MessageHitDTO[] = await (await app.api(hira, '/api/search/messages?q=viva')).json();
    const awt = hits.filter((h) => h.groupName === 'Advanced Web Technologies · BCS-7A');
    expect(awt.length).toBeGreaterThan(0);
    expect(awt.every((h) => /viva/i.test(h.snippet))).toBe(true);
    expect(awt.map((h) => h.sender)).toContain('Dr. Imran Haider');

    // Usman (BCS-7B) only ever sees chats he belongs to.
    const usman = await userBy(ACCOUNTS.usman);
    const usmanCookie = await app.login(ACCOUNTS.usman);
    const his: MessageHitDTO[] = await (
      await app.api(usmanCookie, '/api/search/messages?q=viva')
    ).json();
    const mine = new Set(
      (await Membership.find({ userId: usman._id }).distinct('groupId')).map(String),
    );
    expect(his.every((h) => mine.has(h.groupId))).toBe(true);
    expect(his.some((h) => h.groupName === 'Advanced Web Technologies · BCS-7A')).toBe(false);

    // A private DM is found by its two people, never by IT.
    const imranSocket = await app.connect(ACCOUNTS.imran);
    const hiraUser = await userBy(ACCOUNTS.hira);
    const dm = (await imranSocket
      .timeout(5000)
      .emitWithAck('dm:open', { userId: String(hiraUser._id) })) as {
      ok: true;
      data: { id: string };
    };
    await imranSocket.timeout(5000).emitWithAck('message:send', {
      groupId: dm.data.id,
      body: 'Your thesis draft looks promising, well done.',
      clientId: clientId(),
    });
    const forHira: MessageHitDTO[] = await (
      await app.api(hira, '/api/search/messages?q=thesis')
    ).json();
    expect(forHira[0]).toMatchObject({ groupName: 'Dr. Imran Haider', sender: 'Dr. Imran Haider' });
    const admin = await app.login(ACCOUNTS.admin);
    expect(await (await app.api(admin, '/api/search/messages?q=thesis')).json()).toEqual([]);

    // Prefixes work too ("thes" finds "thesis").
    const prefix: MessageHitDTO[] = await (
      await app.api(hira, '/api/search/messages?q=thes')
    ).json();
    expect(prefix.some((h) => h.snippet.includes('thesis'))).toBe(true);
  });
});
