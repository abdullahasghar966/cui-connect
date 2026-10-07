import {
  canDeleteMessage,
  canDM,
  canPost,
  canRead,
  type MessageDTO,
  type MessagesPage,
  type SendMessageInput,
} from '@cui/shared';
import { Types } from 'mongoose';
import { assertAllowed, forbidden, isDuplicateKeyError, notFound } from '../lib/errors';
import {
  Group,
  type GroupDoc,
  Membership,
  type MembershipDoc,
  Message,
  type MessageDoc,
  User,
  type UserDoc,
} from '../models';
import {
  broadcastMessage,
  broadcastMessageDeleted,
  broadcastReadReceipt,
  notifyMembershipAdded,
} from '../realtime/notifier';
import { recordMessageSent } from '../realtime/stats';
import { recordAudit } from './audit';
import { computeDMFacts } from './direct';
import {
  toMessageDTO,
  toObjectId,
  toPolicyGroup,
  toPolicyMembership,
  toPolicyUser,
} from './mappers';

async function loadGroupContext(user: UserDoc, groupId: string) {
  const [group, membership] = await Promise.all([
    Group.findById(groupId).lean<GroupDoc>(),
    Membership.findOne({ groupId, userId: user._id }).lean<MembershipDoc>(),
  ]);
  if (!group) throw notFound('This group no longer exists.');
  return { group, membership };
}

/** The other participant of a DM thread (null when they no longer exist). */
async function directPeer(group: GroupDoc, me: UserDoc): Promise<UserDoc | null> {
  const peerMembership = await Membership.findOne({
    groupId: group._id,
    userId: { $ne: me._id },
  }).lean<MembershipDoc>();
  return peerMembership ? User.findById(peerMembership.userId).lean<UserDoc>() : null;
}

export interface SendResult {
  message: MessageDTO;
  /** False when the clientId was already used (an idempotent retry): nothing new to broadcast. */
  created: boolean;
}

/**
 * Persists and broadcasts a message after enforcing the group's communication boundary.
 * Denied attempts are audited (without the message body) so admins can see boundaries work.
 */
export async function sendMessage(user: UserDoc, input: SendMessageInput): Promise<SendResult> {
  const { group, membership } = await loadGroupContext(user, input.groupId);
  const policyUser = toPolicyUser(user);
  let decision = canPost(policyUser, toPolicyGroup(group), toPolicyMembership(membership));

  let peer: UserDoc | null = null;
  if (decision.allowed && group.type === 'DIRECT') {
    peer = await directPeer(group, user);
    decision = peer
      ? canDM(policyUser, toPolicyUser(peer), await computeDMFacts(user, peer, group))
      : {
          allowed: false,
          code: 'DM_RESTRICTED',
          reason: 'The other participant no longer exists.',
        };
  }

  if (!decision.allowed) {
    void recordAudit({
      action: 'message.denied',
      severity: 'warning',
      actor: user,
      summary: `${user.name} was blocked from posting in "${
        group.type === 'DIRECT' ? 'a direct message' : group.name
      }": ${decision.reason}`,
      targetType: 'group',
      targetId: group._id,
      meta: { code: decision.code },
    });
    throw forbidden(decision.reason, { reason: decision.code });
  }

  const existing = await Message.findOne({
    senderId: user._id,
    clientId: input.clientId,
  }).lean<MessageDoc>();
  if (existing) return { message: toMessageDTO(existing, user), created: false };

  let doc: MessageDoc;
  try {
    const created = await Message.create({
      groupId: group._id,
      senderId: user._id,
      body: input.body,
      clientId: input.clientId,
    });
    doc = created.toObject<MessageDoc>();
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    const raced = await Message.findOne({
      senderId: user._id,
      clientId: input.clientId,
    }).lean<MessageDoc>();
    if (!raced) throw err;
    return { message: toMessageDTO(raced, user), created: false };
  }

  await Promise.all([
    Group.updateOne({ _id: group._id }, { $set: { lastMessageAt: doc.createdAt } }),
    // Your own message is, by definition, read by you.
    Membership.updateOne(
      { groupId: group._id, userId: user._id },
      { $set: { lastReadMessageId: doc._id } },
    ),
  ]);

  const message = toMessageDTO(doc, user);
  // First message of a new DM: surface the thread in the recipient's sidebar.
  if (group.type === 'DIRECT' && !group.lastMessageAt && peer) {
    await notifyMembershipAdded(String(peer._id), String(group._id));
  }
  broadcastMessage(message);
  recordMessageSent();
  return { message, created: true };
}

export async function listMessages(
  user: UserDoc,
  groupId: string,
  query: { before?: string; after?: string; limit: number },
): Promise<MessagesPage> {
  const { group, membership } = await loadGroupContext(user, groupId);
  assertAllowed(canRead(toPolicyUser(user), toPolicyGroup(group), toPolicyMembership(membership)));

  const idFilter: Record<string, Types.ObjectId> = {};
  if (query.before) idFilter.$lt = new Types.ObjectId(query.before);
  if (query.after) idFilter.$gt = new Types.ObjectId(query.after);
  const filter = {
    groupId: group._id,
    ...(Object.keys(idFilter).length ? { _id: idFilter } : {}),
  };
  // `after` pages forward (gap-fill after reconnect); otherwise newest-first going back.
  const forward = !!query.after && !query.before;
  const docs = await Message.find(filter)
    .sort({ _id: forward ? 1 : -1 })
    .limit(query.limit + 1)
    .lean<MessageDoc[]>();
  const hasMore = docs.length > query.limit;
  const page = docs.slice(0, query.limit);
  if (!forward) page.reverse();

  const senders = await User.find({ _id: { $in: [...new Set(page.map((m) => m.senderId))] } }).lean<
    UserDoc[]
  >();
  const senderById = new Map(senders.map((s) => [String(s._id), s]));
  return {
    messages: page.map((m) => toMessageDTO(m, senderById.get(String(m.senderId)))),
    hasMore,
  };
}

export async function deleteMessage(user: UserDoc, messageId: string) {
  const message = await Message.findById(messageId).lean<MessageDoc>();
  if (!message || message.deletedAt) throw notFound('This message no longer exists.');
  const { group, membership } = await loadGroupContext(user, String(message.groupId));
  assertAllowed(
    canDeleteMessage(toPolicyUser(user), toPolicyGroup(group), toPolicyMembership(membership), {
      senderId: String(message.senderId),
      createdAt: message.createdAt,
    }),
  );
  await Message.updateOne(
    { _id: message._id },
    { $set: { deletedAt: new Date(), deletedById: user._id, body: '' } },
  );
  const groupId = String(group._id);
  broadcastMessageDeleted(groupId, messageId);
  if (String(message.senderId) !== String(user._id)) {
    void recordAudit({
      action: 'message.removed',
      actor: user,
      summary: `${user.name} removed a message in "${group.name}"`,
      targetType: 'group',
      targetId: group._id,
    });
  }
  return { groupId, messageId };
}

/** Moves the reader's read marker forward (never backwards). */
export async function markRead(user: UserDoc, groupId: string, messageId: string): Promise<void> {
  const group = await Group.findById(groupId).select('type').lean<Pick<GroupDoc, 'type'>>();
  if (!group) throw notFound('This group no longer exists.');
  const messageOid = toObjectId(messageId);
  const exists = await Message.exists({ _id: messageOid, groupId });
  if (!exists) throw notFound('Message not found in this group.');
  const result = await Membership.updateOne(
    {
      groupId,
      userId: user._id,
      $or: [{ lastReadMessageId: null }, { lastReadMessageId: { $lt: messageOid } }],
    },
    { $set: { lastReadMessageId: messageOid } },
  );
  if (result.modifiedCount) {
    broadcastReadReceipt(groupId, String(user._id), messageId, group.type === 'DIRECT');
  }
}
