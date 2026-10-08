import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { User } from '../src/models';
import { DEMO_PASSWORD } from '../src/seed/data';
import { setupFreshCampus } from '../src/seed/setup';
import { ACCOUNTS, startTestApp, type TestApp } from './helpers';

let app: TestApp;

beforeAll(async () => {
  app = await startTestApp();
});

afterAll(async () => {
  await app?.close();
});

const ADMIN = {
  name: 'Registrar IT',
  email: 'it.head@cuiatd.edu.pk',
  password: 'Fresh-Start-2026',
};

describe('npm run setup (fresh campus)', () => {
  it('refuses invalid input without touching the existing data', async () => {
    const before = await User.countDocuments();
    await expect(setupFreshCampus({ ...ADMIN, password: 'short' })).rejects.toThrow();
    expect(await User.countDocuments()).toBe(before);
  });

  it('replaces the demo campus with one admin and the official channel', async () => {
    expect((await app.api(null, '/api/auth/demo-accounts')).status).toBe(200);
    await setupFreshCampus(ADMIN);

    expect(await User.countDocuments()).toBe(1);
    expect((await app.api(null, '/api/auth/demo-accounts')).status).toBe(404);
    const demoLogin = await app.api(null, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: ACCOUNTS.admin, password: DEMO_PASSWORD }),
    });
    expect(demoLogin.status).toBe(401);

    const admin = await app.login(ADMIN.email, ADMIN.password);
    const groups = await (await app.api(admin, '/api/groups')).json();
    expect(groups.map((g: { name: string }) => g.name)).toEqual(['CUI Islamabad Official']);
  });

  it('lets the admin build the campus in order: department → people → section → course', async () => {
    const admin = await app.login(ADMIN.email, ADMIN.password);
    const post = async (path: string, body: object) => {
      const res = await app.api(admin, `/api/admin${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      expect(res.status, `${path}: ${await res.clone().text()}`).toBe(201);
      return res.json();
    };

    const dept = await post('/departments', { code: 'CS', name: 'Department of Computer Science' });
    const teacher = await post('/users', {
      name: 'Dr. Test Teacher',
      email: 'teacher@cuiatd.edu.pk',
      password: 'Teacher-2026',
      role: 'faculty',
      departmentId: dept.id,
      isHOD: true,
    });
    const section = await post('/sections', {
      departmentId: dept.id,
      program: 'BCS',
      intake: 'FA23',
      name: 'BCS-7A',
      batchAdvisorId: teacher.id,
    });
    await post('/users', {
      name: 'Test Student',
      email: 'student@cuiatd.edu.pk',
      password: 'Student-2026',
      role: 'student',
      regNo: 'FA23-BCS-001',
      sectionId: section.id,
    });
    await post('/courses', {
      code: 'CSC337',
      title: 'Advanced Web Technologies',
      sectionId: section.id,
      instructorId: teacher.id,
    });

    const student = await app.login('FA23-BCS-001', 'Student-2026');
    const names = (await (await app.api(student, '/api/groups')).json()).map(
      (g: { name: string }) => g.name,
    );
    expect(names).toEqual(
      expect.arrayContaining([
        'CUI Islamabad Official',
        'CS Department Notices',
        'BCS-7A Class',
        'Advanced Web Technologies · BCS-7A',
      ]),
    );
    expect(names).not.toContain('CS Faculty Lounge');
  });
});
