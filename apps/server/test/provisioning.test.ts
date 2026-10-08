import type { GroupDTO } from '@cui/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Department, Section } from '../src/models';
import { ACCOUNTS, groupByName, nextEvent, startTestApp, type TestApp, userBy } from './helpers';

let app: TestApp;
let admin: string;

beforeAll(async () => {
  app = await startTestApp();
  admin = await app.login(ACCOUNTS.admin);
});

afterAll(async () => {
  await app?.close();
});

async function groupsOf(identifier: string, password?: string): Promise<GroupDTO[]> {
  const cookie = await app.login(identifier, password);
  return (await app.api(cookie, '/api/groups')).json();
}

const roleIn = (groups: GroupDTO[], name: string) => groups.find((g) => g.name === name)?.myRole;

describe('official groups follow university structure', () => {
  it('a student is in exactly the groups their section, department and courses imply', async () => {
    const groups = await groupsOf(ACCOUNTS.hira);
    const names = groups.map((g) => g.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'CUI Islamabad Official',
        'CS Department Notices',
        'BCS-7A Class',
        'Advanced Web Technologies · BCS-7A',
        'Compiler Construction · BCS-7A',
        'ACM CUI Chapter',
      ]),
    );
    for (const hidden of [
      'CS Faculty Lounge',
      'CS CR Council',
      'BCS-7B Class',
      'EE Department Notices',
      'CS FYP Committee',
    ]) {
      expect(names).not.toContain(hidden);
    }
    expect(roleIn(groups, 'CS Department Notices')).toBe('member');
  });

  it('HODs, batch advisors, instructors and offices get the right roles', async () => {
    const imran = await groupsOf(ACCOUNTS.imran);
    expect(roleIn(imran, 'BCS-7A Class')).toBe('moderator');
    expect(roleIn(imran, 'Advanced Web Technologies · BCS-7A')).toBe('owner');
    expect(roleIn(imran, 'CS Faculty Lounge')).toBe('member');

    const hod = await groupsOf(ACCOUNTS.hodCS);
    expect(roleIn(hod, 'CS Department Notices')).toBe('moderator');
    expect(roleIn(hod, 'CS Faculty Lounge')).toBe('owner');
    expect(roleIn(hod, 'CS CR Council')).toBe('owner');

    expect(roleIn(await groupsOf(ACCOUNTS.director), 'CUI Islamabad Official')).toBe('moderator');
    expect(roleIn(await groupsOf(ACCOUNTS.admin), 'CUI Islamabad Official')).toBe('owner');
    expect(roleIn(await groupsOf(ACCOUNTS.ali), 'CS CR Council')).toBe('member');
  });

  it('a repeater enrolled from another section joins only that course', async () => {
    const names = (await groupsOf(ACCOUNTS.bilal)).map((g) => g.name);
    expect(names).toContain('Compiler Construction · BCS-7A');
    expect(names).toContain('BCS-7B Class');
    expect(names).not.toContain('BCS-7A Class');
  });

  it('creating a section and a course provisions their groups and enrols students', async () => {
    const cs = await Department.findOne({ code: 'CS' }).lean();
    const naveed = await userBy('naveed.anwar@comsats.edu.pk');
    const sectionRes = await app.api(admin, '/api/admin/sections', {
      method: 'POST',
      body: JSON.stringify({
        departmentId: String(cs?._id),
        program: 'BCS',
        intake: 'FA26',
        name: 'BCS-1A',
        batchAdvisorId: String(naveed._id),
      }),
    });
    expect(sectionRes.status).toBe(201);
    const { id: sectionId } = await sectionRes.json();

    const userRes = await app.api(admin, '/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Areeba Nadeem',
        email: 'fa26-bcs-001@isbstudent.comsats.edu.pk',
        password: 'Welcome@2026',
        role: 'student',
        sectionId,
        regNo: 'fa26-bcs-001',
      }),
    });
    expect(userRes.status).toBe(201);
    const student = await userRes.json();
    expect(student).toMatchObject({ regNo: 'FA26-BCS-001', departmentCode: 'CS' });

    const courseRes = await app.api(admin, '/api/admin/courses', {
      method: 'POST',
      body: JSON.stringify({
        code: 'CSC101',
        title: 'Programming Fundamentals',
        sectionId,
        instructorId: String(naveed._id),
      }),
    });
    expect(courseRes.status).toBe(201);

    const names = (await groupsOf('FA26-BCS-001', 'Welcome@2026')).map((g) => g.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'BCS-1A Class',
        'Programming Fundamentals · BCS-1A',
        'CS Department Notices',
        'CUI Islamabad Official',
      ]),
    );
    const naveedGroups = await groupsOf('naveed.anwar@comsats.edu.pk');
    expect(roleIn(naveedGroups, 'BCS-1A Class')).toBe('moderator');
    expect(roleIn(naveedGroups, 'Programming Fundamentals · BCS-1A')).toBe('owner');
  });

  it('refuses to put a student into a faculty lounge (membership boundary)', async () => {
    const lounge = await groupByName('CS Faculty Lounge');
    const hira = await userBy(ACCOUNTS.hira);
    const res = await app.api(admin, `/api/groups/${lounge._id}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId: String(hira._id) }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toMatch(/faculty/i);
  });

  it('refuses to remove a membership that comes from university records', async () => {
    const section = await groupByName('BCS-7A Class');
    const hira = await userBy(ACCOUNTS.hira);
    const res = await app.api(admin, `/api/groups/${section._id}/members/${hira._id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(409);
  });

  it('moving a student to another section moves their class group', async () => {
    const maryam = await userBy('FA23-BCS-006');
    const sevenB = await Section.findOne({ name: 'BCS-7B' }).lean();
    const res = await app.api(admin, `/api/admin/users/${maryam._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ sectionId: String(sevenB?._id) }),
    });
    expect(res.status).toBe(200);
    const names = (await groupsOf('FA23-BCS-006')).map((g) => g.name);
    expect(names).toContain('BCS-7B Class');
    expect(names).not.toContain('BCS-7A Class');
  });

  it('appointing a new HOD demotes the previous one everywhere', async () => {
    const naveed = await userBy('naveed.anwar@comsats.edu.pk');
    const res = await app.api(admin, `/api/admin/users/${naveed._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isHOD: true }),
    });
    expect(res.status).toBe(200);
    expect((await userBy(ACCOUNTS.hodCS)).isHOD).toBe(false);
    expect(roleIn(await groupsOf('naveed.anwar@comsats.edu.pk'), 'CS Department Notices')).toBe(
      'moderator',
    );
    expect(roleIn(await groupsOf(ACCOUNTS.hodCS), 'CS Department Notices')).toBe('member');
  });

  it('imports accounts from CSV and reports bad rows by line', async () => {
    const csv = [
      'name,email,role,department,section,regNo,isCR',
      'Sara Ahmed,fa23-bcs-040@isbstudent.comsats.edu.pk,student,,BCS-7B,FA23-BCS-040,false',
      'Dr. Kashif Ali,kashif.ali@comsats.edu.pk,faculty,EE,,,',
      'Broken Row,not-an-email,student,,BCS-7B,FA23-BCS-041,',
      'Ghost,ghost@comsats.edu.pk,student,,BCS-9Z,FA23-BCS-042,',
    ].join('\n');
    const res = await app.api(admin, '/api/admin/users/import', {
      method: 'POST',
      body: JSON.stringify({ csv, defaultPassword: 'Welcome@2026' }),
    });
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.created).toBe(2);
    expect(result.errors.map((e: { line: number }) => e.line)).toEqual([4, 5]);
    expect((await groupsOf('FA23-BCS-040', 'Welcome@2026')).map((g) => g.name)).toContain(
      'BCS-7B Class',
    );
  });
});

describe('course enrollment management', () => {
  async function courseId(code: string, sectionName: string): Promise<string> {
    const courses: { id: string; code: string; sectionName: string }[] = await (
      await app.api(admin, '/api/admin/courses')
    ).json();
    const course = courses.find((c) => c.code === code && c.sectionName === sectionName);
    if (!course) throw new Error(`No course ${code} for ${sectionName}`);
    return course.id;
  }

  it('lists enrolled students, including a repeater from another section', async () => {
    const id = await courseId('CSC441', 'BCS-7A');
    const res = await app.api(admin, `/api/admin/courses/${id}/students`);
    expect(res.status).toBe(200);
    const students: { regNo: string; sectionName: string }[] = await res.json();
    expect(students.map((s) => s.regNo)).toEqual(
      expect.arrayContaining(['FA23-BCS-001', 'FA23-BCS-002', 'FA23-BCS-033']),
    );
    expect(students.find((s) => s.regNo === 'FA23-BCS-033')?.sectionName).toBe('BCS-7B');
  });

  it('keeps enrollment admin-only', async () => {
    const id = await courseId('CSC441', 'BCS-7A');
    const student = await app.login(ACCOUNTS.hira);
    expect((await app.api(student, `/api/admin/courses/${id}/students`)).status).toBe(403);
  });

  it('enrolling and removing a student adds and removes the course group live', async () => {
    const id = await courseId('CSC337', 'BCS-7A');
    const course = await groupByName('Advanced Web Technologies · BCS-7A');
    const mehwish = await userBy(ACCOUNTS.mehwish);
    const socket = await app.connect(ACCOUNTS.mehwish);

    const added = nextEvent(socket, 'group:added', (g) => g.id === String(course._id));
    const enroll = await app.api(admin, `/api/admin/courses/${id}/enroll`, {
      method: 'POST',
      body: JSON.stringify({ studentIds: [String(mehwish._id)] }),
    });
    expect(enroll.status).toBe(200);
    expect((await added).myRole).toBe('member');

    const removed = nextEvent(socket, 'group:removed', (p) => p.groupId === String(course._id));
    const drop = await app.api(admin, `/api/admin/courses/${id}/students/${mehwish._id}`, {
      method: 'DELETE',
    });
    expect(drop.status).toBe(200);
    await removed;
    expect((await groupsOf(ACCOUNTS.mehwish)).map((g) => g.name)).not.toContain(
      'Advanced Web Technologies · BCS-7A',
    );
    socket.disconnect();
  });

  it('records deactivation and reactivation in plain words', async () => {
    const zainab = await userBy('FA23-BCS-004');
    for (const active of [false, true]) {
      const res = await app.api(admin, `/api/admin/users/${zainab._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      });
      expect(res.status).toBe(200);
    }
    const entries: { action: string; summary: string }[] = await (
      await app.api(admin, '/api/admin/audit?limit=5')
    ).json();
    expect(entries.map((e) => e.action)).toEqual(
      expect.arrayContaining(['user.deactivated', 'user.reactivated']),
    );
    expect(entries.find((e) => e.action === 'user.reactivated')?.summary).toMatch(
      /reactivated Zainab Malik/,
    );
  });
});
