/**
 * Notification centre: one place every feature uses to tell people something happened (marks
 * published, a class cancelled, a seat assigned…). Saved for the bell's history and pushed
 * live to every open tab of the recipient.
 */
import type {
  MarkNotificationsInput,
  NotificationDTO,
  NotificationsPage,
  NotificationType,
} from '@cui/shared';
import { Types } from 'mongoose';
import { logger } from '../lib/logger';
import { Notification, type NotificationDoc, type UserDoc } from '../models';
import { pushNotification } from '../realtime/notifier';
import { type Id, toObjectId } from './mappers';

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

/** Never throws: a failed notification must not undo the action that caused it. */
export async function notify(userIds: readonly Id[], input: NotificationInput): Promise<number> {
  const unique = [...new Set(userIds.map(String))];
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
