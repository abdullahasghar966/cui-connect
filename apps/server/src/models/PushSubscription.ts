import { model, Schema, type Types } from 'mongoose';

/** One browser or phone that agreed to receive push notifications for a person. */
export interface PushSubscriptionDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** The push service's address for this device (Google, Mozilla, Microsoft or Apple). */
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: Date;
}

const pushSubscriptionSchema = new Schema<PushSubscriptionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
    userAgent: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const PushSubscription = model<PushSubscriptionDoc>(
  'PushSubscription',
  pushSubscriptionSchema,
);
