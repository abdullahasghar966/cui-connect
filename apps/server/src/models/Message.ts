import { model, Schema, type Types } from 'mongoose';

export interface MessageDoc {
  _id: Types.ObjectId;
  groupId: Types.ObjectId;
  senderId: Types.ObjectId;
  body: string;
  /** Client-generated id that makes retries idempotent. */
  clientId: string | null;
  deletedAt: Date | null;
  deletedById: Types.ObjectId | null;
  createdAt: Date;
}

const messageSchema = new Schema<MessageDoc>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, default: '' },
    clientId: { type: String, default: null },
    deletedAt: { type: Date, default: null },
    deletedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// History pagination: newest-first within a group.
messageSchema.index({ groupId: 1, _id: -1 });
messageSchema.index(
  { senderId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } },
);

export const Message = model<MessageDoc>('Message', messageSchema);
