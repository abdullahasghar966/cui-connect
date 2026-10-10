import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CatalogCourse, CourseOffering, Section, Term } from '../src/models';
import { ensureAcademicDefaults } from '../src/services/academic-setup';
import { notify } from '../src/services/notifications';
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

describe('terms, rooms and the catalog', () => {
  it('lists terms with exactly one current term', async () => {
    const cookie = await app.login(ACCOUNTS.hira);
    const terms: { code: string; current: boolean }[] = await (
      await app.api(cookie, '/api/academics/terms')
    ).json();
    expect(terms[0]).toMatchObject({ code: 'FA26', current: true });
    expect(terms.filter((t) => t.current)).toHaveLength(1);
  });

  it('searches the catalog and shows a course page', async () => {
    const cookie = await app.login(ACCOUNTS.hira);
    const found: { code: string }[] = await (
      await app.api(cookie, '/api/academics/catalog?q=web')
    ).json();
    expect(found.map((c) => c.code)).toEqual(['CSC336', 'CSC337']);

    const awt = await (await app.api(cookie, '/api/academics/catalog/csc337')).json();
    expect(awt).toMatchObject({ code: 'CSC337', credits: 3, labCredits: 1, offeredSections: 2 });
    expect(awt.clos[0].code).toBe('CLO1');
    expect((await app.api(cookie, '/api/academics/catalog/XYZ999')).status).toBe(404);
    // A search box is never a regular expression.
    expect((await app.api(cookie, '/api/academics/catalog?q=.*')).status).toBe(200);
  });

  it('only IT, the HOD and the department office edit a department catalog', async () => {
    const course = {
      title: 'Advanced Web Technologies',
      departmentId: String((await CatalogCourse.findOne({ code: 'CSC337' }))?.departmentId),
      credits: 3,
      labCredits: 1,
      prerequisites: ['CSC336'],
    };
    const student = await app.login(ACCOUNTS.hira);
    const hodEE = await app.login('tariq.mahmood@comsats.edu.pk');
    const hodCS = await app.login(ACCOUNTS.hodCS);
    expect((await send(student, 'PUT', '/api/academics/catalog/CSC337', course)).status).toBe(403);
    expect((await send(hodEE, 'PUT', '/api/academics/catalog/CSC337', course)).status).toBe(403);
    const ok = await send(hodCS, 'PUT', '/api/academics/catalog/CSC337', {
      ...course,
      description: 'Updated by the HOD',
    });
    expect(ok.status).toBe(200);
    expect((await ok.json()).description).toBe('Updated by the HOD');
    const self = await send(hodCS, 'PUT', '/api/academics/catalog/CSC337', {
      ...course,
      prerequisites: ['CSC337'],
    });
    expect(self.status).toBe(400);
  });

  it('imports catalog courses from CSV and reports bad rows', async () => {
    const admin = await app.login(ACCOUNTS.admin);
    const student = await app.login(ACCOUNTS.hira);
    const csv = [
      'code,title,department,credits,labCredits,prerequisites',
      'CSC470,Natural Language Processing,CS,3,1,CSC462 CSC460',
      'BAD1,Broken,CS,3,0,',
      'CSC471,Unknown department,XX,3,0,',
    ].join('\n');
    expect((await send(student, 'POST', '/api/academics/catalog/import', { csv })).status).toBe(
      403,
    );
    const res = await send(admin, 'POST', '/api/academics/catalog/import', { csv });
    const result = await res.json();
    expect(result.created).toBe(1);
    expect(result.errors.map((e: { line: number }) => e.line)).toEqual([3, 4]);
    expect(await CatalogCourse.findOne({ code: 'CSC470' }).lean()).toMatchObject({
      prerequisites: ['CSC462', 'CSC460'],
      labCredits: 1,
    });
  });

  it('manages rooms (IT only) and refuses duplicates', async () => {
    const admin = await app.login(ACCOUNTS.admin);
    const staff = await app.login(ACCOUNTS.exam);
    const room = { name: 'C-301', block: 'Academic Block III', kind: 'classroom', capacity: 40 };
    expect((await send(staff, 'POST', '/api/admin/rooms', room)).status).toBe(403);
    const created = await send(admin, 'POST', '/api/admin/rooms', room);
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ name: 'C-301', examRows: 0, floor: null });
    expect((await send(admin, 'POST', '/api/admin/rooms', room)).status).toBe(409);
    expect((await send(admin, 'POST', '/api/admin/rooms', { ...room, capacity: 0 })).status).toBe(
      400,
    );
  });

  it('upgrades courses created before terms and the catalog existed', async () => {
    const section = await Section.findOne({ name: 'BCS-7A' }).lean();
    const instructor = await userBy(ACCOUNTS.imran);
    const legacy = await CourseOffering.create({
      code: 'CSC496',
      title: 'Legacy Seminar',
      sectionId: section?._id,
      instructorId: instructor._id,
      termId: null,
    });
    await ensureAcademicDefaults();
    const current = await Term.findOne({ current: true }).lean();
    expect(String((await CourseOffering.findById(legacy._id).lean())?.termId)).toBe(
      String(current?._id),
    );
    expect(await CatalogCourse.findOne({ code: 'CSC496' }).lean()).toMatchObject({
      title: 'Legacy Seminar',
      credits: 3,
    });
    await CourseOffering.deleteOne({ _id: legacy._id });
  });
});

describe('notification centre', () => {
  it('delivers live only to the recipient, once per key, and tracks read state', async () => {
    const hira = await userBy(ACCOUNTS.hira);
    const hiraSocket = await app.connect(ACCOUNTS.hira);
    const aliSocket = await app.connect(ACCOUNTS.ali);
    const received = nextEvent(hiraSocket, 'notification:new');
    const aliQuiet = noEvent(aliSocket, 'notification:new');

    const input = {
      type: 'results' as const,
      title: 'AWT Sessional I marks are out',
      link: '/academics/results',
      key: 'test:marks',
    };
    expect(await notify([hira._id], input)).toBe(1);
    expect(await received).toMatchObject({ title: input.title, read: false, type: 'results' });
    expect(await aliQuiet).toBe(true);
    expect(await notify([hira._id], input)).toBe(0); // same key: not sent twice

    const cookie = await app.login(ACCOUNTS.hira);
    const page = await (await app.api(cookie, '/api/notifications')).json();
    expect(page.unread).toBe(1);
    expect(page.notifications[0]).toMatchObject({ title: input.title, link: '/academics/results' });

    const ali = await app.login(ACCOUNTS.ali);
    expect((await (await app.api(ali, '/api/notifications')).json()).notifications).toEqual([]);
    // Marking someone else's notification as read does nothing.
    await send(ali, 'POST', '/api/notifications/read', { ids: [page.notifications[0].id] });
    expect((await (await app.api(cookie, '/api/notifications')).json()).unread).toBe(1);

    const marked = await send(cookie, 'POST', '/api/notifications/read', { all: true });
    expect(await marked.json()).toEqual({ unread: 0 });
    expect((await send(cookie, 'POST', '/api/notifications/read', {})).status).toBe(400);
  });
});

describe('a new term', () => {
  it('can be added and made current; new course offerings belong to it', async () => {
    const admin = await app.login(ACCOUNTS.admin);
    const created = await send(admin, 'POST', '/api/admin/terms', {
      code: 'sp27',
      startsOn: '2027-02-15',
      endsOn: '2027-07-15',
    });
    expect(created.status).toBe(201);
    const term = await created.json();
    expect(term).toMatchObject({ code: 'SP27', name: 'Spring 2027', current: false });
    expect(
      (
        await send(admin, 'POST', '/api/admin/terms', {
          code: 'SP27',
          startsOn: '2027-02-15',
          endsOn: '2027-07-15',
        })
      ).status,
    ).toBe(409);
    const bad = await send(admin, 'POST', '/api/admin/terms', {
      code: 'FA27',
      startsOn: '2027-09-01',
      endsOn: '2027-08-01',
    });
    expect(bad.status).toBe(400);

    expect((await send(admin, 'POST', `/api/admin/terms/${term.id}/current`)).status).toBe(200);
    const terms: { code: string; current: boolean }[] = await (
      await app.api(admin, '/api/academics/terms')
    ).json();
    expect(terms.filter((t) => t.current).map((t) => t.code)).toEqual(['SP27']);
    // The admin's course list now shows the (empty) new term.
    expect(await (await app.api(admin, '/api/admin/courses')).json()).toEqual([]);
  });
});
