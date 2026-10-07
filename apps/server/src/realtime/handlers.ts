import {
  type AckCallback,
  type AckError,
  groupRefSchema,
  lockGroupSchema,
  messageRefSchema,
  muteMemberSchema,
  openDmSchema,
  readReceiptSchema,
  sendMessageSchema,
} from '@cui/shared';
import { env } from '../config/env';
import { AppError, parse, rateLimited, unauthorized } from '../lib/errors';
import { logger } from '../lib/logger';
import { Membership, User, type UserDoc } from '../models';
import { openDirect } from '../services/direct';
import { deleteMessage, markRead, sendMessage } from '../services/messages';
import { joinGroup, leaveGroup, muteMember, setLocked } from '../services/moderation';
import { isOnline, markConnected, markDisconnected } from './presence';
import { TokenBucket } from './rateLimit';
import { groupRoom, type IoServer, type IoSocket, userRoom } from './types';

function toAckError(err: unknown): AckError {
  if (err instanceof AppError) return { ok: false, code: err.code, message: err.message };
  logger.error({ err }, 'Socket handler failed');
  return { ok: false, code: 'INTERNAL', message: 'Something went wrong. Please try again.' };
}

/** Runs an async handler and always answers the acknowledgement (if the client sent one). */
function respond<T>(ack: unknown, run: () => Promise<T>): void {
  const reply = typeof ack === 'function' ? (ack as AckCallback<T>) : undefined;
  run()
    .then((data) => reply?.({ ok: true, data }))
    .catch((err: unknown) => reply?.(toAckError(err)));
}

/** Re-reads the user on every event so role/flag changes and deactivation apply instantly. */
async function liveUser(socket: IoSocket): Promise<UserDoc> {
  const user = await User.findById(socket.data.userId).lean<UserDoc>();
  if (!user?.active) {
    socket.emit('session:revoked', { reason: 'Your account is no longer active.' });
    socket.disconnect();
    throw unauthorized('Your session has ended.');
  }
  return user;
}

export function registerConnection(io: IoServer, socket: IoSocket): void {
  const { userId } = socket.data;
  const presenceRooms = socket.data.presenceGroupIds.map(groupRoom);

  socket.join([userRoom(userId), ...socket.data.groupIds.map(groupRoom)]);
  if (markConnected(userId) && presenceRooms.length) {
    io.to(presenceRooms).emit('presence:update', { userId, online: true });
  }

  const messageBucket = new TokenBucket(env.MESSAGE_BURST, env.MESSAGE_RATE_PER_SEC);
  const typingBucket = new TokenBucket(10, 5);

  socket.on('message:send', (payload, ack) =>
    respond(ack, async () => {
      if (!messageBucket.take()) throw rateLimited();
      const input = parse(sendMessageSchema, payload);
      const { message } = await sendMessage(await liveUser(socket), input);
      return message;
    }),
  );

  socket.on('message:delete', (payload, ack) =>
    respond(ack, async () => {
      const { messageId } = parse(messageRefSchema, payload);
      return deleteMessage(await liveUser(socket), messageId);
    }),
  );

  socket.on('message:read', (payload, ack) =>
    respond(ack, async () => {
      const { groupId, messageId } = parse(readReceiptSchema, payload);
      await markRead(await liveUser(socket), groupId, messageId);
      return null;
    }),
  );

  const relayTyping = (payload: unknown, typing: boolean) => {
    const parsed = groupRefSchema.safeParse(payload);
    if (!parsed.success || !typingBucket.take()) return;
    const room = groupRoom(parsed.data.groupId);
    // Rooms mirror memberships, so only members can signal and only members receive.
    if (!socket.rooms.has(room)) return;
    socket.to(room).emit('typing', {
      groupId: parsed.data.groupId,
      userId,
      name: socket.data.name,
      typing,
    });
  };
  socket.on('typing:start', (payload) => relayTyping(payload, true));
  socket.on('typing:stop', (payload) => relayTyping(payload, false));

  socket.on('group:lock', (payload, ack) =>
    respond(ack, async () => {
      const { groupId, locked } = parse(lockGroupSchema, payload);
      return setLocked(await liveUser(socket), groupId, locked);
    }),
  );

  socket.on('member:mute', (payload, ack) =>
    respond(ack, async () => muteMember(await liveUser(socket), parse(muteMemberSchema, payload))),
  );

  socket.on('group:join', (payload, ack) =>
    respond(ack, async () => {
      const { groupId } = parse(groupRefSchema, payload);
      return joinGroup(await liveUser(socket), groupId);
    }),
  );

  socket.on('group:leave', (payload, ack) =>
    respond(ack, async () => {
      const { groupId } = parse(groupRefSchema, payload);
      await leaveGroup(await liveUser(socket), groupId);
      return null;
    }),
  );

  socket.on('dm:open', (payload, ack) =>
    respond(ack, async () => {
      const { userId: peerId } = parse(openDmSchema, payload);
      return openDirect(await liveUser(socket), peerId);
    }),
  );

  socket.on('presence:list', (ack) =>
    respond(ack, async () => {
      const peers = await Membership.find({
        groupId: { $in: socket.data.presenceGroupIds },
      }).distinct('userId');
      return peers.map(String).filter((id) => id !== userId && isOnline(id));
    }),
  );

  socket.on('disconnect', () => {
    if (!markDisconnected(userId)) return;
    if (presenceRooms.length)
      io.to(presenceRooms).emit('presence:update', { userId, online: false });
    User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
  });
}
