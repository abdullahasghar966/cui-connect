import type { GroupDTO } from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PushSubscription, ServerKey } from '../src/models';
import { notify } from '../src/services/notifications';
import { ACCOUNTS, clientId, startTestApp, type TestApp, userBy } from './helpers';

/** What the (fake) push service received, and which endpoints it should reject. */
const pushes = vi.hoisted(() => ({
  sent: [] as { endpoint: string; payload: Record<string, string>; subject: string }[],
  reject: new Map<string, number>(),
}));

vi.mock('web-push', async (importOriginal) => {
  const real = await importOriginal<typeof import('web-push')>();
  class WebPushError extends Error {
    constructor(
      message: string,
      readonly statusCode: number,
    ) {
      super(message);
    }
  }
  return {
    WebPushError,
    default: {
      generateVAPIDKeys: real.generateVAPIDKeys,
      sendNotification: async (
        subscription: { endpoint: string },
        payload: string,
        options: { vapidDetails: { subject: string } },
      ) => {
        const status = pushes.reject.get(subscription.endpoint);
        if (status) throw new WebPushError('Rejected by the push service', status);
        pushes.sent.push({
          endpoint: subscription.endpoint,
          payload: JSON.parse(payload),
          subject: options.vapidDetails.subject,
        });
        return { statusCode: 201 };
      },
    },
  };
});

let app: TestApp;

beforeAll(async () => {
  app = await startTestApp();
});

afterEach(async () => {
  await app.disconnectAll();
  pushes.sent.length = 0;
});

afterAll(async () => {
  await app?.close();
});

const device = (id: string) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
  keys: { p256dh: 'BOr1x9sQ0z6lH2ZtU8W8eK3pS4dM7cN1aZ', auth: 'k8JV6sjdbhAiZ' },
});

const subscribe = (cookie: string, body: unknown) =>
  app.api(cookie, '/api/push/subscriptions', { method: 'POST', body: JSON.stringify(body) });

describe('phone push notifications', () => {
  it('generates the server key once and hands out only the public half', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const first = await (await app.api(hira, '/api/push/key')).json();
    const again = await (await app.api(hira, '/api/push/key')).json();
    expect(first.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(again).toEqual(first);
    expect(Object.keys(first)).toEqual(['publicKey']);
    expect(await ServerKey.countDocuments({ name: 'vapid' })).toBe(1);
  });

  it('accepts devices only at real push services (no requests to other servers)', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const internal = await subscribe(hira, {
      ...device('x'),
      endpoint: 'https://169.254.169.254/latest/meta-data',
    });
    expect(internal.status).toBe(400);
    expect((await subscribe(hira, device('hira-phone'))).status).toBe(201);
    expect(await PushSubscription.countDocuments({ endpoint: device('hira-phone').endpoint })).toBe(
      1,
    );
  });

  it('sends every notification to the person’s devices too', async () => {
    const hira = await userBy(ACCOUNTS.hira);
    await notify([hira._id], {
      type: 'results',
      title: 'Advanced Web Technologies Quiz 4 marks are out',
      body: 'You scored 9/10.',
      link: '/academics/results',
    });
    await vi.waitFor(() => expect(pushes.sent).toHaveLength(1));
    expect(pushes.sent[0]).toMatchObject({
      endpoint: device('hira-phone').endpoint,
      payload: {
        title: 'Advanced Web Technologies Quiz 4 marks are out',
        body: 'You scored 9/10.',
        url: '/academics/results',
      },
      subject: expect.stringMatching(/^(mailto:|https:\/\/)/),
    });
  });

  it('pushes a direct message only while the person is away', async () => {
    const hira = await userBy(ACCOUNTS.hira);
    const imran = await app.connect(ACCOUNTS.imran);
    const opened = await imran.timeout(5000).emitWithAck('dm:open', { userId: String(hira._id) });
    if (!opened.ok) throw new Error(opened.message);
    const dm: GroupDTO = opened.data;
    const say = (body: string) =>
      imran
        .timeout(5000)
        .emitWithAck('message:send', { groupId: dm.id, body, clientId: clientId() });

    await say('Please bring your laptop tomorrow.');
    await vi.waitFor(() => expect(pushes.sent).toHaveLength(1));
    expect(pushes.sent[0]?.payload).toMatchObject({
      title: 'Dr. Imran Haider',
      body: 'Please bring your laptop tomorrow.',
      url: `/chat/${dm.id}`,
      tag: `dm:${dm.id}`,
    });

    // Online now: the message arrives in the app, not as a push.
    await app.connect(ACCOUNTS.hira);
    await say('Thanks, see you at 11.');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(pushes.sent).toHaveLength(1);
  });

  it('forgets a device the push service says is gone, and lets people turn it off', async () => {
    const ali = await app.login(ACCOUNTS.ali);
    await subscribe(ali, device('ali-old-phone'));
    await subscribe(ali, device('ali-laptop'));
    pushes.reject.set(device('ali-old-phone').endpoint, 410);
    const aliUser = await userBy(ACCOUNTS.ali);
    await notify([aliUser._id], { type: 'system', title: 'Hello' });
    await vi.waitFor(async () =>
      expect(await PushSubscription.countDocuments({ userId: aliUser._id })).toBe(1),
    );
    expect(pushes.sent.map((p) => p.endpoint)).toEqual([device('ali-laptop').endpoint]);

    const off = await app.api(ali, '/api/push/subscriptions', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint: device('ali-laptop').endpoint }),
    });
    expect(off.status).toBe(200);
    expect(await PushSubscription.countDocuments({ userId: aliUser._id })).toBe(0);
  });

  it('keeps "only in the app" kinds and, if asked, direct messages off the phone', async () => {
    const hiraCookie = await app.login(ACCOUNTS.hira);
    const hira = await userBy(ACCOUNTS.hira);
    const saved = await app.api(hiraCookie, '/api/notifications/settings', {
      method: 'PUT',
      body: JSON.stringify({ levels: { results: 'app' }, directMessagePush: false }),
    });
    expect(saved.status).toBe(200);

    await notify([hira._id], { type: 'results', title: 'Quiz 5 marks are out' });
    const imran = await app.connect(ACCOUNTS.imran);
    const opened = await imran.timeout(5000).emitWithAck('dm:open', { userId: String(hira._id) });
    if (!opened.ok) throw new Error(opened.message);
    await imran.timeout(5000).emitWithAck('message:send', {
      groupId: opened.data.id,
      body: 'Are you coming to the lab?',
      clientId: clientId(),
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(pushes.sent).toHaveLength(0);
    // Still in the app.
    const page = await (await app.api(hiraCookie, '/api/notifications')).json();
    expect(page.notifications[0].title).toBe('Quiz 5 marks are out');

    // Announcements from IT always reach the phone.
    await notify([hira._id], { type: 'system', title: 'Campus closed tomorrow' });
    await vi.waitFor(() => expect(pushes.sent).toHaveLength(1));
  });
});
