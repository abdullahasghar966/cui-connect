/**
 * Bridge from services to live sockets. Services call these helpers after changing data;
 * when no Socket.IO server is attached (seed script, unit tests) they are no-ops.
 */
import type {
  AuditDTO,
  GroupUpdateEvent,
  LiveStatsDTO,
  MemberUpdateEvent,
  MessageDTO,
} from '@cui/shared';
import { buildGroupDTO } from '../services/groups';
import { type AdminNamespace, groupRoom, type IoServer, userRoom } from './types';

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
