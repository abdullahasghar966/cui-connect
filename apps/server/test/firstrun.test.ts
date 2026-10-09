import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../src/config/env';
import { User } from '../src/models';
import { nextEvent, noEvent, startTestApp, type TestApp } from './helpers';

let app: TestApp;

beforeAll(async () => {
  app = await startTestApp({ seed: false });
});

afterAll(async () => {
  env.SETUP_CODE = undefined;
  await app?.close();
});

const ADMIN = { name: 'Salman Ahmed', email: 'it@cuiatd.edu.pk', password: 'First-Admin-2026' };

const setup = (body: object) =>
  app.api(null, '/api/auth/setup', { method: 'POST', body: JSON.stringify(body) });

describe('first-run setup page', () => {
  it('reports that setup is needed on an empty database', async () => {
    const res = await app.api(null, '/api/auth/setup');
    expect(await res.json()).toEqual({ needed: true, codeRequired: false });
    expect((await app.api(null, '/api/auth/demo-accounts')).status).toBe(404);
  });

  it('requires the server setup code when one is configured', async () => {
    env.SETUP_CODE = 'blue-falcon-42';
    expect((await (await app.api(null, '/api/auth/setup')).json()).codeRequired).toBe(true);

    expect((await setup(ADMIN)).status).toBe(403);
    expect((await setup({ ...ADMIN, setupCode: 'guess' })).status).toBe(403);
    expect(await User.countDocuments()).toBe(0);
  });

  it('creates the first admin, signs them in, and closes the setup page', async () => {
    const res = await setup({ ...ADMIN, setupCode: 'blue-falcon-42' });
    expect(res.status).toBe(201);
    expect((await res.json()).user).toMatchObject({ role: 'admin', email: ADMIN.email });

    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const groups = await (await app.api(cookie, '/api/groups')).json();
    expect(groups.map((g: { name: string }) => g.name)).toEqual(['CUI Islamabad Official']);

    expect((await (await app.api(null, '/api/auth/setup')).json()).needed).toBe(false);
    const again = await setup({ ...ADMIN, email: 'intruder@x.com', setupCode: 'blue-falcon-42' });
    expect(again.status).toBe(409);
    expect(await User.countDocuments()).toBe(1);
  });
});

describe('changing your own password', () => {
  it('needs the current password, keeps this tab signed in and signs out the others', async () => {
    const thisTab = await app.login(ADMIN.email, ADMIN.password);
    const otherDevice = await app.login(ADMIN.email, ADMIN.password);
    const keptSocket = await app.connectWithCookie(thisTab);
    const otherSocket = await app.connectWithCookie(otherDevice);

    const change = (body: object) =>
      app.api(thisTab, '/api/auth/password', { method: 'POST', body: JSON.stringify(body) });
    const wrong = await change({ currentPassword: 'nope', newPassword: 'Second-Pass-2026' });
    expect(wrong.status).toBe(400);

    const revoked = nextEvent(otherSocket, 'session:revoked');
    const keptQuiet = noEvent(keptSocket, 'session:revoked');
    const res = await change({
      currentPassword: ADMIN.password,
      newPassword: 'Second-Pass-2026',
      keepSocketId: keptSocket.id,
    });
    expect(res.status).toBe(200);
    await revoked;
    expect(await keptQuiet).toBe(true);

    const freshCookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    expect((await app.api(freshCookie, '/api/auth/me')).status).toBe(200);
    expect((await app.api(otherDevice, '/api/auth/me')).status).toBe(401);
    await expect(app.login(ADMIN.email, ADMIN.password)).rejects.toThrow();
    await expect(app.login(ADMIN.email, 'Second-Pass-2026')).resolves.toMatch(/cui_session=/);
  });
});
