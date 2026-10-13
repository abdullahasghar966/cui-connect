/**
 * Notification centre: one place every feature uses to tell people something happened (marks
 * published, a class cancelled, a seat assigned…). Saved for the bell's history, pushed live to
 * every open tab of the recipient, and sent to their phone if they turned push notifications on.
 * Each person chooses, per kind: app and phone, only in the app, or off (IT announcements stay on).
 */
import {
  ALWAYS_ON_NOTIFICATIONS,
  type MarkNotificationsInput,
  type NotificationDTO,
  type NotificationLevel,
  type NotificationPrefs,
  type NotificationSettingsDTO,
  type NotificationSettingsInput,
  type NotificationsPage,
  type NotificationType,
  notificationLevel,
  notificationLevels,
  notificationSettingsSchema,
  toNotificationPrefs,
} from '@cui/shared';
import { Types } from 'mongoose';
import { parse } from '../lib/errors';
import { logger } from '../lib/logger';
import { Notification, type NotificationDoc, User, type UserDoc } from '../models';
import { pushNotification } from '../realtime/notifier';
import { type Id, toObjectId } from './mappers';
import { sendPush } from './push';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  /** Same key + same person = sent once (reminders, re-publishing). */
  key?: string;
}

export function toNotificationDTO(doc: NotificationDoc): NotificationDTO {
  return {
    id: String(doc._id),
    type: doc.type,
    title: doc.title,
    body: doc.body,
    link: doc.link,
    read: !!doc.readAt,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Each recipient's choice for this kind (missing = app and phone, also if the lookup fails). */
async function levelsFor(
  userIds: string[],
  type: NotificationType,
): Promise<Map<string, NotificationLevel>> {
  const levels = new Map<string, NotificationLevel>();
  if (ALWAYS_ON_NOTIFICATIONS.includes(type)) return levels;
  try {
    const users = await User.find({ _id: { $in: userIds.map(toObjectId) } })
      .select('notificationPrefs')
      .lean<Pick<UserDoc, '_id' | 'notificationPrefs'>[]>();
    for (const u of users) levels.set(String(u._id), notificationLevel(u.notificationPrefs, type));
  } catch (err) {
    logger.error({ err }, 'Failed to read notification settings');
  }
  return levels;
}

/** Never throws: a failed notification must not undo the action that caused it. */
export async function notify(userIds: readonly Id[], input: NotificationInput): Promise<number> {
  const everyone = [...new Set(userIds.map(String))];
  // People who turned this kind off don't get it at all; "only in the app" means no push.
  const levels = everyone.length ? await levelsFor(everyone, input.type) : new Map();
  const unique = everyone.filter((id) => levels.get(id) !== 'off');
  if (!unique.length) return 0;
  const now = new Date();
  const docs: NotificationDoc[] = unique.map((userId) => ({
    _id: new Types.ObjectId(),
    userId: toObjectId(userId),
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    readAt: null,
    key: input.key ?? null,
    createdAt: now,
  }));
  let saved = docs;
  try {
    await Notification.insertMany(docs, { ordered: false });
  } catch (err) {
    // Duplicate keys mean "already sent"; keep the ones that went in.
    const inserted = (err as { insertedDocs?: NotificationDoc[] }).insertedDocs;
    if (!inserted) {
      logger.error({ err }, 'Failed to save notifications');
      return 0;
    }
    const ok = new Set(inserted.map((d) => String(d._id)));
    saved = docs.filter((d) => ok.has(String(d._id)));
  }
  for (const doc of saved) pushNotification(String(doc.userId), toNotificationDTO(doc));
  const pushTo = saved.filter((d) => levels.get(String(d.userId)) !== 'app');
  if (pushTo.length) {
    // Phones and desktops with notifications on (never waits, never throws).
    void sendPush(
      pushTo.map((d) => d.userId),
      { title: input.title, body: input.body, url: input.link, tag: input.key ?? null },
    );
  }
  return saved.length;
}

export async function listNotifications(
  user: UserDoc,
  query: { before?: string; limit: number },
): Promise<NotificationsPage> {
  const filter: Record<string, unknown> = { userId: user._id };
  if (query.before) filter._id = { $lt: toObjectId(query.before) };
  const [docs, unread] = await Promise.all([
    Notification.find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean<NotificationDoc[]>(),
    Notification.countDocuments({ userId: user._id, readAt: null }),
  ]);
  return {
    notifications: docs.slice(0, query.limit).map(toNotificationDTO),
    unread,
    hasMore: docs.length > query.limit,
  };
}

export async function markNotifications(
  user: UserDoc,
  input: MarkNotificationsInput,
): Promise<{ unread: number }> {
  const filter: Record<string, unknown> = { userId: user._id, readAt: null };
  if ('ids' in input) filter._id = { $in: input.ids.map(toObjectId) };
  await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  return { unread: await Notification.countDocuments({ userId: user._id, readAt: null }) };
}

// ---- Settings ----

function toSettingsDTO(prefs: Partial<NotificationPrefs> | undefined): NotificationSettingsDTO {
  return {
    levels: notificationLevels(prefs),
    directMessagePush: prefs?.directMessagePush !== false,
    alwaysOn: [...ALWAYS_ON_NOTIFICATIONS],
  };
}

export async function notificationSettings(user: UserDoc): Promise<NotificationSettingsDTO> {
  const doc = await User.findById(user._id)
    .select('notificationPrefs')
    .lean<Pick<UserDoc, 'notificationPrefs'>>();
  return toSettingsDTO(doc?.notificationPrefs);
}

export async function saveNotificationSettings(
  user: UserDoc,
  input: NotificationSettingsInput,
): Promise<NotificationSettingsDTO> {
  const { levels, directMessagePush } = parse(notificationSettingsSchema, input);
  const prefs = toNotificationPrefs(levels, directMessagePush);
  await User.updateOne({ _id: user._id }, { $set: { notificationPrefs: prefs } });
  return toSettingsDTO(prefs);
}
