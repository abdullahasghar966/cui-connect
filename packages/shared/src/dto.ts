/** Wire formats returned by the REST API and pushed over Socket.IO. */
import type { GroupType, MemberRole, Office, Role } from './constants';
import type { GroupSettings, PolicyGroup, PolicyMembership, PolicyUser } from './policy';

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  regNo: string | null;
  designation: string | null;
  office: Office | null;
  departmentId: string | null;
  departmentCode: string | null;
  sectionId: string | null;
  sectionName: string | null;
  isHOD: boolean;
  isCR: boolean;
}

export type PublicUserDTO = Pick<
  UserDTO,
  | 'id'
  | 'name'
  | 'role'
  | 'regNo'
  | 'designation'
  | 'office'
  | 'departmentCode'
  | 'sectionName'
  | 'isHOD'
  | 'isCR'
>;

export interface MessageSenderDTO {
  id: string;
  name: string;
  role: Role;
  designation: string | null;
  office: Office | null;
  isHOD: boolean;
  isCR: boolean;
}

export interface MessageDTO {
  id: string;
  groupId: string;
  body: string;
  createdAt: string;
  clientId: string | null;
  deleted: boolean;
  sender: MessageSenderDTO;
}

export interface MessagesPage {
  messages: MessageDTO[];
  hasMore: boolean;
}

export interface GroupDTO {
  id: string;
  name: string;
  description: string | null;
  type: GroupType;
  /** Provisioned by the university structure (cannot be deleted). */
  system: boolean;
  departmentId: string | null;
  sectionId: string | null;
  courseId: string | null;
  settings: GroupSettings;
  createdById: string | null;
  memberCount: number;
  lastMessage: MessageDTO | null;
  lastMessageAt: string | null;
  myRole: MemberRole | null;
  mutedUntil: string | null;
  lastReadMessageId: string | null;
  unread: number;
  /** DIRECT only: the other participant. */
  peer: PublicUserDTO | null;
  /** DIRECT only: the last message the other participant has read (for "Seen"). */
  peerLastReadMessageId: string | null;
}

export interface MemberDTO {
  user: PublicUserDTO;
  role: MemberRole;
  mutedUntil: string | null;
  source: 'auto' | 'manual';
  joinedAt: string;
}

export interface DepartmentDTO {
  id: string;
  code: string;
  name: string;
  userCount: number;
}

export interface SectionDTO {
  id: string;
  name: string;
  program: string;
  intake: string;
  departmentId: string;
  departmentCode: string | null;
  batchAdvisor: { id: string; name: string } | null;
  studentCount: number;
}

export interface CourseDTO {
  id: string;
  code: string;
  title: string;
  sectionId: string;
  sectionName: string | null;
  instructor: { id: string; name: string } | null;
  studentCount: number;
  groupId: string | null;
}

export interface AdminGroupDTO {
  id: string;
  name: string;
  description: string | null;
  type: GroupType;
  system: boolean;
  settings: GroupSettings;
  memberCount: number;
  lastMessageAt: string | null;
}

export type AuditSeverity = 'info' | 'warning';

export interface AuditDTO {
  id: string;
  action: string;
  severity: AuditSeverity;
  summary: string;
  actor: { id: string; name: string; role: Role } | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

export interface AdminOverviewDTO {
  users: Record<Role, number>;
  groups: Partial<Record<GroupType, number>>;
  messages: number;
  online: number;
  /** University setup progress for the admin checklist. */
  academics: { currentTerm: string; rooms: number; catalog: number; programs: number };
}

export interface LiveStatsDTO {
  onlineUsers: number;
  connections: number;
  messagesLastMinute: number;
  deniedLastMinute: number;
  at: string;
}

export interface CsvImportResultDTO {
  created: number;
  errors: { line: number; message: string }[];
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

// ---- Adapters from DTOs to policy inputs (used by the web client for UI hints) ----

export function toPolicyUser(user: UserDTO): PolicyUser {
  return {
    id: user.id,
    role: user.role,
    active: user.active,
    departmentId: user.departmentId,
    sectionId: user.sectionId,
    office: user.office,
    isHOD: user.isHOD,
    isCR: user.isCR,
  };
}

export function toPolicyGroup(group: GroupDTO): PolicyGroup {
  return {
    id: group.id,
    type: group.type,
    departmentId: group.departmentId,
    sectionId: group.sectionId,
    courseId: group.courseId,
    settings: group.settings,
  };
}

export function toPolicyMembership(group: GroupDTO): PolicyMembership | null {
  return group.myRole ? { role: group.myRole, mutedUntil: group.mutedUntil } : null;
}
