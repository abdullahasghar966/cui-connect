import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from '../src/seed/data';
import { ACCOUNTS, startTestApp, type TestApp, userBy } from './helpers';

let app: TestApp;

beforeAll(async () => {
  app = await startTestApp();
});

afterAll(async () => {
  await app?.close();
});

const loginRequest = (identifier: string, password: string) =>
  app.api(null, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });

describe('authentication', () => {
  it('signs in with an email and sets an httpOnly, SameSite=Lax session cookie', async () => {
    const res = await loginRequest(ACCOUNTS.hodCS, DEMO_PASSWORD);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({ role: 'faculty', isHOD: true, departmentCode: 'CS' });
    expect(body.user.passwordHash).toBeUndefined();
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/cui_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('marks the cookie Secure only when the sign-in arrived over HTTPS (e.g. a local tunnel)', async () => {
    const viaTunnel = await app.api(null, '/api/auth/login', {
      method: 'POST',
      headers: { 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ identifier: ACCOUNTS.hira, password: DEMO_PASSWORD }),
    });
    expect(viaTunnel.headers.get('set-cookie')).toMatch(/;\s*Secure/i);
    const plain = await loginRequest(ACCOUNTS.hira, DEMO_PASSWORD);
    expect(plain.headers.get('set-cookie')).not.toMatch(/;\s*Secure/i);
  });

  it('signs in with a registration number, case-insensitively', async () => {
    const res = await loginRequest(ACCOUNTS.hira.toLowerCase(), DEMO_PASSWORD);
    expect(res.status).toBe(200);
    const { user } = await res.json();
    expect(user).toMatchObject({ name: 'Hira Khan', role: 'student', sectionName: 'BCS-7A' });
  });

  it('rejects wrong passwords and unknown accounts with the same message', async () => {
    const wrong = await loginRequest(ACCOUNTS.hira, 'not-the-password');
    const unknown = await loginRequest('nobody@comsats.edu.pk', 'whatever123');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect((await wrong.json()).error.message).toBe((await unknown.json()).error.message);
  });

  it('validates the request body', async () => {
    const res = await loginRequest('', '');
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION');
  });

  it('requires a session for the API and accepts a valid one', async () => {
    expect((await app.api(null, '/api/groups')).status).toBe(401);
    expect((await app.api('cui_session=abc.def.ghi', '/api/auth/me')).status).toBe(401);
    const cookie = await app.login(ACCOUNTS.ali);
    const me = await app.api(cookie, '/api/auth/me');
    expect(me.status).toBe(200);
    expect((await me.json()).user).toMatchObject({ isCR: true, regNo: 'FA23-BCS-001' });
  });

  it('keeps non-admins out of admin endpoints', async () => {
    const student = await app.login(ACCOUNTS.hira);
    const faculty = await app.login(ACCOUNTS.hodCS);
    const admin = await app.login(ACCOUNTS.admin);
    expect((await app.api(student, '/api/admin/users')).status).toBe(403);
    expect((await app.api(faculty, '/api/admin/overview')).status).toBe(403);
    const overview = await app.api(admin, '/api/admin/overview');
    expect(overview.status).toBe(200);
    expect((await overview.json()).users.student).toBe(24);
  });

  it('logout clears the session cookie', async () => {
    const res = await app.api(null, '/api/auth/logout', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/cui_session=;/);
  });

  it('deactivating an account revokes its existing sessions immediately', async () => {
    const adminCookie = await app.login(ACCOUNTS.admin);
    const studentCookie = await app.login(ACCOUNTS.ahmed);
    const ahmed = await userBy(ACCOUNTS.ahmed);
    expect((await app.api(studentCookie, '/api/auth/me')).status).toBe(200);

    const res = await app.api(adminCookie, `/api/admin/users/${ahmed._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: false }),
    });
    expect(res.status).toBe(200);
    expect((await app.api(studentCookie, '/api/auth/me')).status).toBe(401);
    expect((await loginRequest(ACCOUNTS.ahmed, DEMO_PASSWORD)).status).toBe(403);
  });

  it('serves demo accounts for the login screen', async () => {
    const res = await app.api(null, '/api/auth/demo-accounts');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accounts.length).toBeGreaterThan(4);
  });
});
