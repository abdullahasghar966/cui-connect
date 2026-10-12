import {
  canDeleteMessage,
  canDM,
  canPin,
  canPost,
  canPostAnonymously,
  canRead,
  MAX_PINS,
  type MessageDTO,
  type MessagesPage,
  type PinDTO,
  type PinInput,
  type ReactInput,
  type ReactionDTO,
  type SendMessageInput,
} from '@cui/shared';
import { Types } from 'mongoose';
import { assertAllowed, badRequest, forbidden, isDuplicateKeyError, notFound } from '../lib/errors';
import { escapeRegex } from '../lib/text';
import {
  Group,
  type GroupDoc,
  Membership,
  type MembershipDoc,
  Message,
  type MessageDoc,
  type ReplyRefDoc,
  User,
  type UserDoc,
} from '../models';
import {
  broadcastMessage,
  broadcastMessageDeleted,
  broadcastMessageUpdated,
  broadcastReadReceipt,
  notifyMembershipAdded,
} from '../realtime/notifier';
import { isOnline } from '../realtime/presence';
import { recordMessageSent } from '../realtime/stats';
import { recordAudit } from './audit';
import { computeDMFacts } from './direct';
import {
  ANONYMOUS_SENDER,
  toMessageDTO,
  toObjectId,
  toPolicyGroup,
  toPolicyMembership,
  toPolicyUser,
  toReactionsDTO,
} from './mappers';
import { notify } from './notifications';
import { sendPush } from './push';

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

  // An anonymous question needs the same right to post, in a course chat, as a student.
  if (decision.allowed && input.anonymous) {
    decision = canPostAnonymously(policyUser, toPolicyGroup(group), toPolicyMembership(membership));
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
  if (existing) return { message: toMessageDTO(existing, user, user._id), created: false };

  const replyTo = input.replyToId ? await replySnapshot(group, input.replyToId) : null;
  // Anonymous questions mention nobody (a mention would point back at the author).
  const mentions = input.anonymous
    ? []
    : await mentionedMembers(group, input.mentionIds ?? [], user, input.body);

  let doc: MessageDoc;
  try {
    const created = await Message.create({
      groupId: group._id,
      senderId: user._id,
      kind: input.poll ? 'poll' : 'text',
      body: input.poll ? input.poll.question : input.body,
      clientId: input.clientId,
      replyTo,
      mentions,
      anonymous: !!input.anonymous,
      poll: input.poll
        ? {
            question: input.poll.question,
            options: input.poll.options.map((text, i) => ({ id: `o${i + 1}`, text })),
            multiple: input.poll.multiple ?? false,
            closedAt: null,
            closedById: null,
            votes: [],
          }
        : null,
    });
    doc = created.toObject<MessageDoc>();
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    const raced = await Message.findOne({
      senderId: user._id,
      clientId: input.clientId,
    }).lean<MessageDoc>();
    if (!raced) throw err;
    return { message: toMessageDTO(raced, user, user._id), created: false };
  }

  await Promise.all([
    Group.updateOne({ _id: group._id }, { $set: { lastMessageAt: doc.createdAt } }),
    // Your own message is, by definition, read by you.
    Membership.updateOne(
      { groupId: group._id, userId: user._id },
      { $set: { lastReadMessageId: doc._id } },
    ),
  ]);

  // First message of a new DM: surface the thread in the recipient's sidebar.
  if (group.type === 'DIRECT' && !group.lastMessageAt && peer) {
    await notifyMembershipAdded(String(peer._id), String(group._id));
  }
  // The room gets the anonymous version; only the author's own copy names them.
  broadcastMessage(toMessageDTO(doc, user));
  recordMessageSent();
  // A direct message to someone who isn't online goes to their phone (one notification per chat).
  if (group.type === 'DIRECT' && peer && !isOnline(String(peer._id))) {
    void sendPush([peer._id], {
      title: user.name,
      body: snippetOf(doc.kind === 'poll' ? `Poll: ${doc.body}` : doc.body, 140),
      url: `/chat/${group._id}`,
      tag: `dm:${group._id}`,
    });
  }
  if (mentions.length) {
    await notify(
      mentions.map((m) => m.userId),
      {
        type: 'mentions',
        title: `${user.name} mentioned you in ${group.type === 'DIRECT' ? 'a direct message' : group.name}`,
        body: snippetOf(doc.body, 140),
        link: `/chat/${group._id}?message=${doc._id}`,
      },
    );
  }
  return { message: toMessageDTO(doc, user, user._id), created: true };
}

const snippetOf = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/** What a reply shows of the message it answers. */
async function replySnapshot(group: GroupDoc, messageId: string): Promise<ReplyRefDoc> {
  const original = await Message.findOne({
    _id: toObjectId(messageId),
    groupId: group._id,
  }).lean<MessageDoc>();
  if (!original || original.deletedAt) {
    throw badRequest('The message you are replying to is no longer in this chat.');
  }
  const author = original.anonymous
    ? ANONYMOUS_SENDER.name
    : ((await User.findById(original.senderId).select('name').lean())?.name ?? 'Former member');
  return {
    messageId: original._id,
    senderName: author,
    snippet: snippetOf(original.kind === 'poll' ? `Poll: ${original.body}` : original.body, 140),
    deleted: false,
  };
}

/** Members of this chat named with @Name in the text (yourself and outsiders are ignored). */
async function mentionedMembers(
  group: GroupDoc,
  ids: string[],
  author: UserDoc,
  body: string,
): Promise<{ userId: Types.ObjectId; name: string }[]> {
  const wanted = [...new Set(ids)].filter((id) => id !== String(author._id)).map(toObjectId);
  if (!wanted.length) return [];
  const members = await Membership.find({ groupId: group._id, userId: { $in: wanted } }).distinct(
    'userId',
  );
  const people = await User.find({ _id: { $in: members }, active: true })
    .select('name')
    .lean<Pick<UserDoc, '_id' | 'name'>[]>();
  // The name must still be in the text (it may have been edited out before sending).
  return people
    .filter((p) => new RegExp(`@${escapeRegex(p.name)}(?![\\p{L}\\p{N}])`, 'iu').test(body))
    .map((p) => ({ userId: p._id, name: p.name }));
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
    messages: page.map((m) => toMessageDTO(m, senderById.get(String(m.senderId)), user._id)),
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
    {
      $set: {
        deletedAt: new Date(),
        deletedById: user._id,
        body: '',
        poll: null,
        reactions: [],
        mentions: [],
        pinnedAt: null,
        pinnedById: null,
        pinnedByName: null,
      },
    },
  );
  // Replies keep their place but no longer quote it.
  await Message.updateMany(
    { 'replyTo.messageId': message._id },
    { $set: { 'replyTo.deleted': true, 'replyTo.snippet': '' } },
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

// ---- Reactions and pins ----

/** A message the person may see (any member of its chat). */
async function loadReadable(user: UserDoc, messageId: string) {
  const message = await Message.findById(toObjectId(messageId)).lean<MessageDoc>();
  if (!message || message.deletedAt) throw notFound('This message no longer exists.');
  const { group, membership } = await loadGroupContext(user, String(message.groupId));
  const context = {
    user: toPolicyUser(user),
    group: toPolicyGroup(group),
    membership: toPolicyMembership(membership),
  };
  assertAllowed(canRead(context.user, context.group, context.membership));
  return { message, group, context };
}

/** Adds your reaction, or takes it back if you had already reacted with that emoji. */
export async function reactToMessage(user: UserDoc, input: ReactInput): Promise<ReactionDTO[]> {
  const { message } = await loadReadable(user, input.messageId);
  const id = message._id;
  const mine = await Message.exists({
    _id: id,
    reactions: { $elemMatch: { emoji: input.emoji, userIds: user._id } },
  });
  if (mine) {
    await Message.updateOne(
      { _id: id },
      { $pull: { 'reactions.$[r].userIds': user._id } },
      { arrayFilters: [{ 'r.emoji': input.emoji }] },
    );
    await Message.updateOne({ _id: id }, { $pull: { reactions: { userIds: { $size: 0 } } } });
  } else {
    const addTo = () =>
      Message.updateOne(
        { _id: id, 'reactions.emoji': input.emoji },
        { $addToSet: { 'reactions.$.userIds': user._id } },
      );
    if (!(await addTo()).matchedCount) {
      const pushed = await Message.updateOne(
        { _id: id, 'reactions.emoji': { $ne: input.emoji } },
        { $push: { reactions: { emoji: input.emoji, userIds: [user._id] } } },
      );
      // Someone else started this emoji at the same moment: join theirs.
      if (!pushed.matchedCount) await addTo();
    }
  }
  const fresh = await Message.findById(id)
    .select('reactions')
    .lean<Pick<MessageDoc, 'reactions'>>();
  const reactions = toReactionsDTO(fresh?.reactions);
  broadcastMessageUpdated({ groupId: String(message.groupId), messageId: String(id), reactions });
  return reactions;
}

export async function pinMessage(user: UserDoc, input: PinInput): Promise<PinDTO | null> {
  const { message, context } = await loadReadable(user, input.messageId);
  assertAllowed(canPin(context.user, context.group, context.membership));
  if (input.pinned && !message.pinnedAt) {
    const pinned = await Message.countDocuments({
      groupId: message.groupId,
      pinnedAt: { $ne: null },
      deletedAt: null,
    });
    if (pinned >= MAX_PINS) {
      throw badRequest(`A chat can have at most ${MAX_PINS} pinned messages. Unpin one first.`);
    }
    await Message.updateOne(
      { _id: message._id },
      { $set: { pinnedAt: new Date(), pinnedById: user._id, pinnedByName: user.name } },
    );
  } else if (!input.pinned) {
    await Message.updateOne(
      { _id: message._id },
      { $set: { pinnedAt: null, pinnedById: null, pinnedByName: null } },
    );
  }
  const fresh = await Message.findById(message._id)
    .select('pinnedAt pinnedByName')
    .lean<Pick<MessageDoc, 'pinnedAt' | 'pinnedByName'>>();
  const pin = fresh?.pinnedAt
    ? { at: fresh.pinnedAt.toISOString(), byName: fresh.pinnedByName ?? user.name }
    : null;
  broadcastMessageUpdated({
    groupId: String(message.groupId),
    messageId: String(message._id),
    pinned: pin,
  });
  return pin;
}

/** A chat's pinned messages, most recently pinned first. */
export async function listPins(user: UserDoc, groupId: string): Promise<MessageDTO[]> {
  const { group, membership } = await loadGroupContext(user, groupId);
  assertAllowed(canRead(toPolicyUser(user), toPolicyGroup(group), toPolicyMembership(membership)));
  const pinned = await Message.find({
    groupId: group._id,
    pinnedAt: { $ne: null },
    deletedAt: null,
  })
    .sort({ pinnedAt: -1 })
    .limit(MAX_PINS)
    .lean<MessageDoc[]>();
  const senders = await User.find({ _id: { $in: pinned.map((m) => m.senderId) } }).lean<
    UserDoc[]
  >();
  const byId = new Map(senders.map((s) => [String(s._id), s]));
  return pinned.map((m) => toMessageDTO(m, byId.get(String(m.senderId)), user._id));
}
