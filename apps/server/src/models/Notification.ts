import { NOTIFICATION_TYPES, type NotificationType } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

export interface NotificationDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  /** Makes repeatable sends (reminders, re-publishing) idempotent per user. */
  key: string | null;
  createdAt: Date;
}

const notificationSchema = new Schema<NotificationDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, default: null },
    link: { type: String, default: null },
    readAt: { type: Date, default: null },
    key: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ userId: 1, _id: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.index(
  { userId: 1, key: 1 },
  { unique: true, partialFilterExpression: { key: { $type: 'string' } } },
);
// Old notifications clean themselves up after 120 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 120 * 24 * 3600 });

export const Notification = model<NotificationDoc>('Notification', notificationSchema);
