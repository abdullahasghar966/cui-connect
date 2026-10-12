/**
 * Phone and desktop push notifications (Web Push). The server signs every push with its own
 * VAPID key pair, generated on first use and kept in the database, so there is nothing to set
 * up. A browser that agrees to notifications gives us an endpoint at its push service (Google,
 * Mozilla, Microsoft or Apple); only those hosts are accepted, so the server can't be made to
 * call internal addresses. Every notification is also pushed; so are direct messages to people
 * who aren't online. Sending never throws: a failed push must not undo what caused it.
 */
import { type PushSubscriptionInput, pushSubscriptionSchema } from '@cui/shared';
import webpush, { WebPushError } from 'web-push';
import { env } from '../config/env';
import { isDuplicateKeyError, parse } from '../lib/errors';
import { logger } from '../lib/logger';
import { PushSubscription, type PushSubscriptionDoc, ServerKey, type UserDoc } from '../models';
import { type Id, toObjectId } from './mappers';

interface KeyPair {
  publicKey: string;
  privateKey: string;
}

let keys: Promise<KeyPair> | null = null;

async function loadOrCreateKeys(): Promise<KeyPair> {
  const stored = await ServerKey.findOne({ name: 'vapid' }).select('+privateKey').lean();
  if (stored) return { publicKey: stored.publicKey, privateKey: stored.privateKey };
  const fresh = webpush.generateVAPIDKeys();
  try {
    await ServerKey.create({ name: 'vapid', ...fresh });
    return fresh;
  } catch (err) {
    // Another server instance created them first: use theirs.
    if (!isDuplicateKeyError(err)) throw err;
    const winner = await ServerKey.findOne({ name: 'vapid' }).select('+privateKey').lean();
    if (!winner) throw err;
    return { publicKey: winner.publicKey, privateKey: winner.privateKey };
  }
}

/** The server's VAPID keys (generated once, then reused). */
export function vapidKeys(): Promise<KeyPair> {
  keys ??= loadOrCreateKeys().catch((err) => {
    keys = null;
    throw err;
  });
  return keys;
}

/** Who push services can contact: the configured address, the site itself, or the project. */
const contact = () =>
  env.PUSH_CONTACT ??
  (process.env.RENDER_EXTERNAL_URL?.startsWith('https://')
    ? process.env.RENDER_EXTERNAL_URL
    : 'https://github.com/abdullahasghar966/cui-connect');

export async function publicPushKey(): Promise<{ publicKey: string }> {
  return { publicKey: (await vapidKeys()).publicKey };
}

/** Saves this device for the person (a device moves to whoever signed in on it last). */
export async function subscribePush(
  user: UserDoc,
  input: PushSubscriptionInput,
  userAgent: string | null,
): Promise<void> {
  const data = parse(pushSubscriptionSchema, input);
  await PushSubscription.updateOne(
    { endpoint: data.endpoint },
    {
      $set: {
        userId: user._id,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        userAgent: userAgent?.slice(0, 300) ?? null,
      },
    },
    { upsert: true },
  );
}

export async function unsubscribePush(user: UserDoc, endpoint: string): Promise<void> {
  await PushSubscription.deleteOne({ userId: user._id, endpoint });
}

export async function hasPushDevice(user: UserDoc): Promise<boolean> {
  return !!(await PushSubscription.exists({ userId: user._id }));
}

export interface PushPayload {
  title: string;
  body?: string | null;
  /** In-app path to open when the notification is tapped. */
  url?: string | null;
  /** Pushes with the same tag replace each other on the device (e.g. one DM thread). */
  tag?: string | null;
}

/** Push services answer these when a subscription is gone or belongs to other keys. */
const GONE = new Set([401, 403, 404, 410]);

/** Sends to every device of these people; returns how many pushes were accepted. */
export async function sendPush(userIds: readonly Id[], payload: PushPayload): Promise<number> {
  try {
    const ids = [...new Set(userIds.map(String))].map((id) => toObjectId(id));
    if (!ids.length) return 0;
    const devices = await PushSubscription.find({ userId: { $in: ids } }).lean<
      PushSubscriptionDoc[]
    >();
    if (!devices.length) return 0;
    const { publicKey, privateKey } = await vapidKeys();
    const body = JSON.stringify({
      title: payload.title,
      body: payload.body ?? '',
      url: payload.url ?? '/notifications',
      tag: payload.tag ?? undefined,
    });
    const results = await Promise.allSettled(
      devices.map((d) =>
        webpush.sendNotification(
          { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
          body,
          {
            vapidDetails: { subject: contact(), publicKey, privateKey },
            TTL: 60 * 60 * 12,
            timeout: 10_000,
          },
        ),
      ),
    );
    const gone: PushSubscriptionDoc['_id'][] = [];
    let sent = 0;
    results.forEach((result, i) => {
      const device = devices[i];
      if (!device) return;
      if (result.status === 'fulfilled') {
        sent++;
        return;
      }
      const status = result.reason instanceof WebPushError ? result.reason.statusCode : 0;
      if (GONE.has(status)) gone.push(device._id);
      else logger.warn({ status, err: result.reason }, 'Push notification failed');
    });
    if (gone.length) await PushSubscription.deleteMany({ _id: { $in: gone } });
    return sent;
  } catch (err) {
    logger.warn({ err }, 'Push notifications could not be sent');
    return 0;
  }
}
