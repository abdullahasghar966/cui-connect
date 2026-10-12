import { model, Schema, type Types } from 'mongoose';

/** A poll inside a chat; the votes live on the message itself. */
export interface PollDoc {
  question: string;
  options: { id: string; text: string }[];
  multiple: boolean;
  closedAt: Date | null;
  closedById: Types.ObjectId | null;
  votes: { userId: Types.ObjectId; optionIds: string[] }[];
}

/** A snapshot of the message being answered (emptied if that one is deleted). */
export interface ReplyRefDoc {
  messageId: Types.ObjectId;
  senderName: string;
  snippet: string;
  deleted: boolean;
}

export interface MessageDoc {
  _id: Types.ObjectId;
  groupId: Types.ObjectId;
  senderId: Types.ObjectId;
  kind: 'text' | 'poll';
  body: string;
  poll: PollDoc | null;
  /** Client-generated id that makes retries idempotent. */
  clientId: string | null;
  replyTo: ReplyRefDoc | null;
  reactions: { emoji: string; userIds: Types.ObjectId[] }[];
  pinnedAt: Date | null;
  pinnedById: Types.ObjectId | null;
  pinnedByName: string | null;
  /** Members mentioned with @Name (names kept for display). */
  mentions: { userId: Types.ObjectId; name: string }[];
  /** Name hidden from everyone else; `senderId` stays for moderation and limits. */
  anonymous: boolean;
  deletedAt: Date | null;
  deletedById: Types.ObjectId | null;
  createdAt: Date;
}

const messageSchema = new Schema<MessageDoc>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['text', 'poll'], default: 'text' },
    body: { type: String, default: '' },
    poll: {
      type: new Schema<PollDoc>(
        {
          question: { type: String, required: true },
          options: { type: [{ _id: false, id: String, text: String }], default: [] },
          multiple: { type: Boolean, default: false },
          closedAt: { type: Date, default: null },
          closedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
          votes: {
            type: [{ _id: false, userId: Schema.Types.ObjectId, optionIds: [String] }],
            default: [],
          },
        },
        { _id: false },
      ),
      default: null,
    },
    clientId: { type: String, default: null },
    replyTo: {
      type: new Schema<ReplyRefDoc>(
        {
          messageId: { type: Schema.Types.ObjectId, required: true },
          senderName: { type: String, required: true },
          snippet: { type: String, default: '' },
          deleted: { type: Boolean, default: false },
        },
        { _id: false },
      ),
      default: null,
    },
    reactions: {
      type: [{ _id: false, emoji: String, userIds: [Schema.Types.ObjectId] }],
      default: [],
    },
    pinnedAt: { type: Date, default: null },
    pinnedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    pinnedByName: { type: String, default: null },
    mentions: {
      type: [{ _id: false, userId: Schema.Types.ObjectId, name: String }],
      default: [],
    },
    anonymous: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// History pagination: newest-first within a group.
messageSchema.index({ groupId: 1, _id: -1 });
// A chat's pinned messages.
messageSchema.index(
  { groupId: 1, pinnedAt: -1 },
  { partialFilterExpression: { pinnedAt: { $type: 'date' } } },
);
// Replies to a message (their snapshots are emptied when it's deleted).
messageSchema.index({ 'replyTo.messageId': 1 }, { sparse: true });
// Message search (whole words, any order); results are limited to chats the reader may read.
messageSchema.index({ body: 'text' }, { default_language: 'english' });
messageSchema.index(
  { senderId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } },
);

export const Message = model<MessageDoc>('Message', messageSchema);
