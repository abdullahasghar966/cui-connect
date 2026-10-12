/** Typed Socket.IO contracts shared by the server and the web client. */
import type { AttendanceCountsDTO, NotificationDTO, RosterEntryDTO } from './academic-dto';
import type { QuizAnswerInput, QuizRefInput } from './academic-schemas';
import type { ErrorCode, MemberRole, Role } from './constants';
import type { QuizStatus } from './coursework';
import type {
  AuditDTO,
  GroupDTO,
  LiveStatsDTO,
  MemberDTO,
  MessageDTO,
  PinDTO,
  PollDTO,
  ReactionDTO,
} from './dto';
import type { GroupSettings } from './policy';
import type {
  GroupRefInput,
  LockGroupInput,
  MessageRefInput,
  MuteMemberInput,
  OpenDmInput,
  PinInput,
  PollVoteInput,
  ReactInput,
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
  'poll:vote': (payload: PollVoteInput, ack: AckCallback<PollDTO>) => void;
  'poll:close': (payload: MessageRefInput, ack: AckCallback<PollDTO>) => void;
  /** Toggles your reaction (anyone who can read the chat). */
  'message:react': (payload: ReactInput, ack: AckCallback<ReactionDTO[]>) => void;
  'message:pin': (payload: PinInput, ack: AckCallback<PinDTO | null>) => void;
  /** Open a live quiz page: students of the course and its instructor. */
  'quiz:join': (payload: QuizRefInput, ack: AckCallback<{ joined: number }>) => void;
  'quiz:leave': (payload: QuizRefInput) => void;
  'quiz:answer': (
    payload: QuizAnswerInput,
    ack: AckCallback<{ questionId: string; choice: number }>,
  ) => void;
}

export interface ServerToClientEvents {
  'message:new': (message: MessageDTO) => void;
  'message:deleted': (payload: { groupId: string; messageId: string }) => void;
  /** Votes changed or the poll closed (sent to the chat's room). */
  'poll:updated': (payload: { groupId: string; messageId: string; poll: PollDTO }) => void;
  /** Reactions or the pin of a message changed (sent to the chat's room). */
  'message:updated': (payload: MessageUpdateEvent) => void;
  typing: (payload: TypingEvent) => void;
  'presence:update': (payload: { userId: string; online: boolean }) => void;
  'read:update': (payload: { groupId: string; userId: string; messageId: string }) => void;
  'group:added': (group: GroupDTO) => void;
  'group:removed': (payload: { groupId: string; reason: string }) => void;
  'group:updated': (payload: GroupUpdateEvent) => void;
  'member:updated': (payload: MemberUpdateEvent) => void;
  'session:revoked': (payload: { reason: string }) => void;
  'notification:new': (notification: NotificationDTO) => void;
  /** A class of these course offerings was added, changed, cancelled or moved. */
  'timetable:changed': (payload: { offeringIds: string[] }) => void;
  /** Seats were taken or freed in next term's offers (everyone registering sees it live). */
  'registration:seats': (payload: { offers: { id: string; seatsTaken: number }[] }) => void;
  /** Someone checked in or was marked (sent to the people running the session). */
  'attendance:update': (payload: AttendanceUpdateEvent) => void;
  /** A live quiz moved on (started, next question, answer shown, ended): refetch it. */
  'quiz:state': (payload: QuizStateEvent) => void;
  /** Answers so far to the open question (sent to the quiz's host only). */
  'quiz:tally': (payload: QuizTallyEvent) => void;
  /** Students on the quiz page (host only). */
  'quiz:presence': (payload: QuizPresenceEvent) => void;
}

export interface QuizStateEvent {
  quizId: string;
  status: QuizStatus;
  current: number;
  revealed: boolean;
}

export interface QuizPresenceEvent {
  quizId: string;
  joined: number;
}

export interface QuizTallyEvent {
  quizId: string;
  questionId: string;
  counts: number[];
  answered: number;
}

export interface MessageUpdateEvent {
  groupId: string;
  messageId: string;
  reactions?: ReactionDTO[];
  /** Present when the pin changed: the pin, or null when unpinned. */
  pinned?: PinDTO | null;
}

export interface AttendanceUpdateEvent {
  sessionId: string;
  entry: RosterEntryDTO | null;
  counts: AttendanceCountsDTO;
  status: 'open' | 'closed';
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
