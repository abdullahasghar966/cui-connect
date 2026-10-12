import {
  type AckCallback,
  type AckError,
  groupRefSchema,
  lockGroupSchema,
  messageRefSchema,
  muteMemberSchema,
  openDmSchema,
  pinSchema,
  pollVoteSchema,
  quizAnswerSchema,
  quizRefSchema,
  reactSchema,
  readReceiptSchema,
  sendMessageSchema,
} from '@cui/shared';
import { env } from '../config/env';
import { AppError, parse, rateLimited, unauthorized } from '../lib/errors';
import { logger } from '../lib/logger';
import { Membership, User, type UserDoc } from '../models';
import { openDirect } from '../services/direct';
import {
  deleteMessage,
  markRead,
  pinMessage,
  reactToMessage,
  sendMessage,
} from '../services/messages';
import { joinGroup, leaveGroup, muteMember, setLocked } from '../services/moderation';
import { closePoll, votePoll } from '../services/polls';
import { answerQuiz, quizAccess } from '../services/quizzes';
import { sendQuizPresence } from './notifier';
import { isOnline, markConnected, markDisconnected } from './presence';
import { TokenBucket } from './rateLimit';
import { groupRoom, type IoServer, type IoSocket, quizHostRoom, quizRoom, userRoom } from './types';

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
  // Changing your mind on a poll is quick clicking, not spam: its own, roomier budget.
  const voteBucket = new TokenBucket(10, 4);
  const quizBucket = new TokenBucket(6, 2);

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

  socket.on('poll:vote', (payload, ack) =>
    respond(ack, async () => {
      if (!voteBucket.take()) throw rateLimited('You are voting too quickly. Slow down.');
      return votePoll(await liveUser(socket), parse(pollVoteSchema, payload));
    }),
  );

  socket.on('message:react', (payload, ack) =>
    respond(ack, async () => {
      if (!voteBucket.take()) throw rateLimited('You are reacting too quickly. Slow down.');
      return reactToMessage(await liveUser(socket), parse(reactSchema, payload));
    }),
  );

  socket.on('message:pin', (payload, ack) =>
    respond(ack, async () => pinMessage(await liveUser(socket), parse(pinSchema, payload))),
  );

  socket.on('poll:close', (payload, ack) =>
    respond(ack, async () => closePoll(await liveUser(socket), parse(messageRefSchema, payload))),
  );

  // Live quizzes: the page joins the quiz's room; the teacher also joins its host room.
  socket.on('quiz:join', (payload, ack) =>
    respond(ack, async () => {
      const { quizId } = parse(quizRefSchema, payload);
      const { host } = await quizAccess(await liveUser(socket), quizId);
      await socket.join(host ? [quizRoom(quizId), quizHostRoom(quizId)] : quizRoom(quizId));
      return { joined: await sendQuizPresence(quizId) };
    }),
  );

  socket.on('quiz:leave', (payload) => {
    const parsed = quizRefSchema.safeParse(payload);
    if (!parsed.success) return;
    const { quizId } = parsed.data;
    socket.leave(quizRoom(quizId));
    socket.leave(quizHostRoom(quizId));
    sendQuizPresence(quizId).catch(() => {});
  });

  socket.on('quiz:answer', (payload, ack) =>
    respond(ack, async () => {
      if (!quizBucket.take()) throw rateLimited('Slow down: one answer per question.');
      return answerQuiz(await liveUser(socket), parse(quizAnswerSchema, payload));
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

  // Quiz pages this socket had open: their teachers' "joined" counts drop once it has gone.
  let openQuizzes: string[] = [];
  socket.on('disconnecting', () => {
    openQuizzes = [...socket.rooms]
      .filter((room) => room.startsWith('quiz:') && !room.endsWith(':host'))
      .map((room) => room.slice('quiz:'.length));
  });

  socket.on('disconnect', () => {
    for (const quizId of openQuizzes) sendQuizPresence(quizId).catch(() => {});
    if (!markDisconnected(userId)) return;
    if (presenceRooms.length)
      io.to(presenceRooms).emit('presence:update', { userId, online: false });
    User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
  });
}
