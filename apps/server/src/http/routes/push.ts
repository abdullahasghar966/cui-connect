/** Turning phone/desktop push notifications on and off for this browser. */
import { pushEndpointSchema } from '@cui/shared';
import { Router } from 'express';
import { currentUser } from '../../auth/middleware';
import { parse } from '../../lib/errors';
import { publicPushKey, sendPush, subscribePush, unsubscribePush } from '../../services/push';

export const pushRouter = Router();

/** The key browsers need to subscribe (the server's VAPID public key). */
pushRouter.get('/key', async (_req, res) => {
  res.json(await publicPushKey());
});

pushRouter.post('/subscriptions', async (req, res) => {
  await subscribePush(currentUser(req), req.body, req.get('user-agent') ?? null);
  res.status(201).json({ ok: true });
});

pushRouter.delete('/subscriptions', async (req, res) => {
  const { endpoint } = parse(pushEndpointSchema, req.body);
  await unsubscribePush(currentUser(req), endpoint);
  res.json({ ok: true });
});

/** Sends yourself a test notification. */
pushRouter.post('/test', async (req, res) => {
  const sent = await sendPush([currentUser(req)._id], {
    title: 'Phone notifications are on',
    body: 'You will get alerts here even when CUI Connect is closed.',
    url: '/notifications',
    tag: 'push-test',
  });
  res.json({ sent });
});
