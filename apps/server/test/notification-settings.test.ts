import type { NotificationSettingsDTO, NotificationsPage } from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Notification } from '../src/models';
import { notify } from '../src/services/notifications';
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

const settings = (cookie: string, body?: unknown) =>
  app.api(cookie, '/api/notifications/settings', {
    method: body === undefined ? 'GET' : 'PUT',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('notification settings', () => {
  it('starts with everything on, and saves each person’s own choices', async () => {
    const ali = await app.login(ACCOUNTS.ali);
    const initial: NotificationSettingsDTO = await (await settings(ali)).json();
    expect(Object.values(initial.levels).every((level) => level === 'all')).toBe(true);
    expect(initial).toMatchObject({ directMessagePush: true, alwaysOn: ['system'] });

    const saved = await settings(ali, {
      levels: { events: 'off', campus: 'app' },
      directMessagePush: false,
    });
    expect(saved.status).toBe(200);
    const again: NotificationSettingsDTO = await (await settings(ali)).json();
    expect(again.levels).toMatchObject({ events: 'off', campus: 'app', results: 'all' });
    expect(again.directMessagePush).toBe(false);

    // Hira's settings are untouched.
    const hira: NotificationSettingsDTO = await (
      await settings(await app.login(ACCOUNTS.hira))
    ).json();
    expect(hira.levels.events).toBe('all');

    expect(
      (await settings(ali, { levels: { system: 'off' }, directMessagePush: true })).status,
    ).toBe(400);
  });

  it('a kind turned off is not saved or sent; the rest arrive as usual', async () => {
    const ahmedCookie = await app.login(ACCOUNTS.ahmed);
    const ahmed = await userBy(ACCOUNTS.ahmed);
    const bilal = await userBy(ACCOUNTS.bilal);
    await settings(ahmedCookie, { levels: { events: 'off' }, directMessagePush: true });
    const socket = await app.connectWithCookie(ahmedCookie);
    const before = await Notification.countDocuments({ userId: ahmed._id });

    // Ahmed turned events off; Bilal didn't.
    const sent = await notify([ahmed._id, bilal._id], {
      type: 'events',
      title: 'Tomorrow: Career Fair 2026 at 10:00 AM',
    });
    expect(sent).toBe(1);
    expect(await Notification.countDocuments({ userId: ahmed._id })).toBe(before);
    expect(
      await Notification.countDocuments({ userId: bilal._id, type: 'events' }),
    ).toBeGreaterThan(0);

    const live = nextEvent(socket, 'notification:new', (n) => n.type === 'system');
    await notify([ahmed._id], { type: 'system', title: 'Campus closed tomorrow' });
    expect((await live).title).toBe('Campus closed tomorrow');
    const page: NotificationsPage = await (await app.api(ahmedCookie, '/api/notifications')).json();
    expect(page.notifications.map((n) => n.title)).not.toContain(
      'Tomorrow: Career Fair 2026 at 10:00 AM',
    );
  });
});
