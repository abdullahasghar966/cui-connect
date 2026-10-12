/**
 * Bridge from services to live sockets. Services call these helpers after changing data;
 * when no Socket.IO server is attached (seed script, unit tests) they are no-ops.
 */
import type {
  AttendanceUpdateEvent,
  AuditDTO,
  GroupUpdateEvent,
  LiveStatsDTO,
  MemberUpdateEvent,
  MessageDTO,
  MessageUpdateEvent,
  NotificationDTO,
  PollDTO,
  QuizStateEvent,
  QuizTallyEvent,
} from '@cui/shared';
import { buildGroupDTO } from '../services/groups';
import {
  type AdminNamespace,
  groupRoom,
  type IoServer,
  quizHostRoom,
  quizRoom,
  userRoom,
} from './types';

let io: IoServer | null = null;
let adminNs: AdminNamespace | null = null;

export function attachRealtime(server: IoServer, admin: AdminNamespace): void {
  io = server;
  adminNs = admin;
}

export function detachRealtime(): void {
  io = null;
  adminNs = null;
}

export function broadcastMessage(message: MessageDTO): void {
  io?.to(groupRoom(message.groupId)).emit('message:new', message);
}

export function pushNotification(userId: string, notification: NotificationDTO): void {
  io?.to(userRoom(userId)).emit('notification:new', notification);
}

/** Live check-ins go only to the people running the session (the instructor, whoever opened it). */
export function sendAttendanceUpdate(userIds: string[], update: AttendanceUpdateEvent): void {
  if (!io || !userIds.length) return;
  io.to([...new Set(userIds)].map(userRoom)).emit('attendance:update', update);
}

/** Timetables are public on campus, so every open timetable view refreshes. */
export function broadcastTimetableChanged(offeringIds: string[]): void {
  io?.emit('timetable:changed', { offeringIds });
}

/** Seats changed in next term's offers: everyone registering sees the counts move. */
export function broadcastRegistrationSeats(offers: { id: string; seatsTaken: number }[]): void {
  if (offers.length) io?.emit('registration:seats', { offers });
}

export function broadcastPollUpdated(groupId: string, messageId: string, poll: PollDTO): void {
  io?.to(groupRoom(groupId)).emit('poll:updated', { groupId, messageId, poll });
}

/**
 * A live quiz moved on: everyone on its page, and the course chat's members (whose coursework
 * pages show what's live), refetch. The event carries no answers.
 */
export function broadcastQuizState(groupId: string | null, event: QuizStateEvent): void {
  if (!io) return;
  const rooms = [quizRoom(event.quizId), quizHostRoom(event.quizId)];
  if (groupId) rooms.push(groupRoom(groupId));
  io.to(rooms).emit('quiz:state', event);
}

/** Live answer counts go to the teacher only, so students can't follow the crowd. */
export function sendQuizTally(quizId: string, tally: QuizTallyEvent): void {
  io?.to(quizHostRoom(quizId)).emit('quiz:tally', tally);
}

/** Students with the quiz page open right now. */
export async function quizJoinedCount(quizId: string): Promise<number> {
  if (!io) return 0;
  const sockets = await io.in(quizRoom(quizId)).fetchSockets();
  return new Set(sockets.filter((s) => s.data.role === 'student').map((s) => s.data.userId)).size;
}

export async function sendQuizPresence(quizId: string): Promise<number> {
  const joined = await quizJoinedCount(quizId);
  io?.to(quizHostRoom(quizId)).emit('quiz:presence', { quizId, joined });
  return joined;
}

/** Reactions or a pin changed: everyone in the chat updates that message. */
export function broadcastMessageUpdated(event: MessageUpdateEvent): void {
  io?.to(groupRoom(event.groupId)).emit('message:updated', event);
}

export function broadcastMessageDeleted(groupId: string, messageId: string): void {
  io?.to(groupRoom(groupId)).emit('message:deleted', { groupId, messageId });
}

export function broadcastGroupUpdated(update: GroupUpdateEvent): void {
  io?.to(groupRoom(update.groupId)).emit('group:updated', update);
}

export function broadcastMemberUpdated(update: MemberUpdateEvent): void {
  io?.to(groupRoom(update.groupId)).emit('member:updated', update);
}

/** Read receipts sync the reader's other tabs; in DMs the other participant sees "Seen". */
export function broadcastReadReceipt(
  groupId: string,
  userId: string,
  messageId: string,
  isDirect: boolean,
): void {
  if (!io) return;
  const payload = { groupId, userId, messageId };
  if (isDirect) io.to(groupRoom(groupId)).emit('read:update', payload);
  else io.to(userRoom(userId)).emit('read:update', payload);
}

/** Puts every live socket of the users into the group's room (used when a DM is created). */
export function joinUsersToGroup(userIds: string[], groupId: string): void {
  if (!io) return;
  io.in(userIds.map(userRoom)).socketsJoin(groupRoom(groupId));
}

/** A membership was created: join the user's sockets and push the group to their sidebar. */
export async function notifyMembershipAdded(userId: string, groupId: string): Promise<void> {
  if (!io) return;
  io.in(userRoom(userId)).socketsJoin(groupRoom(groupId));
  const dto = await buildGroupDTO(userId, groupId);
  if (dto) io.to(userRoom(userId)).emit('group:added', dto);
}

/** A membership was removed: drop the group from the sidebar and stop delivery immediately. */
export function notifyMembershipRemoved(userId: string, groupId: string, reason: string): void {
  if (!io) return;
  io.to(userRoom(userId)).emit('group:removed', { groupId, reason });
  io.in(userRoom(userId)).socketsLeave(groupRoom(groupId));
}

/** Signs the user out everywhere, except the socket `keepSocketId` (the tab making the change). */
export function revokeUserSessions(userId: string, reason: string, keepSocketId?: string): void {
  if (!io) return;
  const except = keepSocketId ? [keepSocketId] : [];
  io.to(userRoom(userId)).except(except).emit('session:revoked', { reason });
  io.in(userRoom(userId)).except(except).disconnectSockets(false);
}

export function publishAudit(entry: AuditDTO): void {
  adminNs?.emit('audit:new', entry);
}

export function publishStats(stats: LiveStatsDTO): void {
  adminNs?.emit('stats', stats);
}
