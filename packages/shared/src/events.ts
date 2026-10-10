/** Typed Socket.IO contracts shared by the server and the web client. */
import type { NotificationDTO } from './academic-dto';
import type { ErrorCode, MemberRole, Role } from './constants';
import type { AuditDTO, GroupDTO, LiveStatsDTO, MemberDTO, MessageDTO } from './dto';
import type { GroupSettings } from './policy';
import type {
  GroupRefInput,
  LockGroupInput,
  MessageRefInput,
  MuteMemberInput,
  OpenDmInput,
  ReadReceiptInput,
  SendMessageInput,
} from './schemas';

export type AckOk<T> = { ok: true; data: T };
export type AckError = { ok: false; code: ErrorCode; message: string };
export type Ack<T> = AckOk<T> | AckError;
export type AckCallback<T> = (response: Ack<T>) => void;

export interface TypingEvent {
  groupId: string;
  userId: string;
  name: string;
  typing: boolean;
}

export interface GroupUpdateEvent {
  groupId: string;
  name?: string;
  description?: string | null;
  settings?: GroupSettings;
  memberCount?: number;
}

export interface MemberUpdateEvent {
  groupId: string;
  userId: string;
  role?: MemberRole;
  mutedUntil?: string | null;
}

export interface ClientToServerEvents {
  'message:send': (payload: SendMessageInput, ack: AckCallback<MessageDTO>) => void;
  'message:delete': (
    payload: MessageRefInput,
    ack: AckCallback<{ groupId: string; messageId: string }>,
  ) => void;
  'message:read': (payload: ReadReceiptInput, ack: AckCallback<null>) => void;
  'typing:start': (payload: GroupRefInput) => void;
  'typing:stop': (payload: GroupRefInput) => void;
  'group:lock': (payload: LockGroupInput, ack: AckCallback<GroupSettings>) => void;
  'group:join': (payload: GroupRefInput, ack: AckCallback<GroupDTO>) => void;
  'group:leave': (payload: GroupRefInput, ack: AckCallback<null>) => void;
  'member:mute': (payload: MuteMemberInput, ack: AckCallback<MemberDTO>) => void;
  'dm:open': (payload: OpenDmInput, ack: AckCallback<GroupDTO>) => void;
  'presence:list': (ack: AckCallback<string[]>) => void;
}

export interface ServerToClientEvents {
  'message:new': (message: MessageDTO) => void;
  'message:deleted': (payload: { groupId: string; messageId: string }) => void;
  typing: (payload: TypingEvent) => void;
  'presence:update': (payload: { userId: string; online: boolean }) => void;
  'read:update': (payload: { groupId: string; userId: string; messageId: string }) => void;
  'group:added': (group: GroupDTO) => void;
  'group:removed': (payload: { groupId: string; reason: string }) => void;
  'group:updated': (payload: GroupUpdateEvent) => void;
  'member:updated': (payload: MemberUpdateEvent) => void;
  'session:revoked': (payload: { reason: string }) => void;
  'notification:new': (notification: NotificationDTO) => void;
}

// biome-ignore lint/complexity/noBannedTypes: Socket.IO expects an (empty) event map here.
export type InterServerEvents = {};

export interface SocketData {
  userId: string;
  name: string;
  role: Role;
}

/** `/admin` namespace: live audit feed and stats for administrators. */
// biome-ignore lint/complexity/noBannedTypes: no client-to-server events on the admin namespace.
export type AdminClientToServerEvents = {};

export interface AdminServerToClientEvents {
  'audit:new': (entry: AuditDTO) => void;
  stats: (stats: LiveStatsDTO) => void;
}
