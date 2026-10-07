import type {
  AuditDTO,
  MessageDTO,
  MessageSenderDTO,
  PolicyGroup,
  PolicyMembership,
  PolicyUser,
  PublicUserDTO,
  UserDTO,
} from '@cui/shared';
import { Types } from 'mongoose';
import {
  type AuditLogDoc,
  Department,
  type DepartmentDoc,
  type GroupDoc,
  type MembershipDoc,
  type MessageDoc,
  Section,
  type SectionDoc,
  type UserDoc,
} from '../models';

export type Id = Types.ObjectId | string;

export const idOf = (value: Id | null | undefined): string | null => (value ? String(value) : null);

export const toObjectId = (value: Id): Types.ObjectId =>
  typeof value === 'string' ? new Types.ObjectId(value) : value;

export const sameId = (a: Id | null | undefined, b: Id | null | undefined): boolean =>
  !!a && !!b && String(a) === String(b);

// ---- Departments/sections change rarely: cache them briefly for DTO labels ----

export interface OrgLookup {
  departments: Map<string, DepartmentDoc>;
  sections: Map<string, SectionDoc>;
}

let orgCache: { value: Promise<OrgLookup>; at: number } | null = null;
const ORG_TTL_MS = 30_000;

export function getOrgLookup(): Promise<OrgLookup> {
  if (!orgCache || Date.now() - orgCache.at > ORG_TTL_MS) {
    const value = Promise.all([
      Department.find().lean<DepartmentDoc[]>(),
      Section.find().lean<SectionDoc[]>(),
    ]).then(([departments, sections]) => ({
      departments: new Map(departments.map((d) => [String(d._id), d])),
      sections: new Map(sections.map((s) => [String(s._id), s])),
    }));
    orgCache = { value, at: Date.now() };
    value.catch(() => {
      orgCache = null;
    });
  }
  return orgCache.value;
}

export function invalidateOrgLookup(): void {
  orgCache = null;
}

// ---- DTO mappers ----

export function toUserDTO(user: UserDoc, org: OrgLookup): UserDTO {
  const departmentId = idOf(user.departmentId);
  const sectionId = idOf(user.sectionId);
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    regNo: user.regNo ?? null,
    designation: user.designation ?? null,
    office: user.office ?? null,
    departmentId,
    departmentCode: departmentId ? (org.departments.get(departmentId)?.code ?? null) : null,
    sectionId,
    sectionName: sectionId ? (org.sections.get(sectionId)?.name ?? null) : null,
    isHOD: !!user.isHOD,
    isCR: !!user.isCR,
  };
}

export function toPublicUserDTO(user: UserDoc, org: OrgLookup): PublicUserDTO {
  const { id, name, role, regNo, designation, office, departmentCode, sectionName, isHOD, isCR } =
    toUserDTO(user, org);
  return { id, name, role, regNo, designation, office, departmentCode, sectionName, isHOD, isCR };
}

export function toSenderDTO(user: UserDoc | undefined, fallbackId: Id): MessageSenderDTO {
  if (!user) {
    return {
      id: String(fallbackId),
      name: 'Former member',
      role: 'student',
      designation: null,
      office: null,
      isHOD: false,
      isCR: false,
    };
  }
  return {
    id: String(user._id),
    name: user.name,
    role: user.role,
    designation: user.designation ?? null,
    office: user.office ?? null,
    isHOD: !!user.isHOD,
    isCR: !!user.isCR,
  };
}

export function toMessageDTO(message: MessageDoc, sender: UserDoc | undefined): MessageDTO {
  const deleted = !!message.deletedAt;
  return {
    id: String(message._id),
    groupId: String(message.groupId),
    body: deleted ? '' : message.body,
    createdAt: message.createdAt.toISOString(),
    clientId: message.clientId ?? null,
    deleted,
    sender: toSenderDTO(sender, message.senderId),
  };
}

export function toAuditDTO(
  log: AuditLogDoc,
  actor: Pick<UserDoc, '_id' | 'name' | 'role'> | null | undefined,
): AuditDTO {
  return {
    id: String(log._id),
    action: log.action,
    severity: log.severity,
    summary: log.summary,
    actor: actor ? { id: String(actor._id), name: actor.name, role: actor.role } : null,
    targetType: log.targetType ?? null,
    targetId: log.targetId ?? null,
    createdAt: log.createdAt.toISOString(),
  };
}

// ---- Policy adapters ----

export function toPolicyUser(user: UserDoc): PolicyUser {
  return {
    id: String(user._id),
    role: user.role,
    active: user.active,
    departmentId: idOf(user.departmentId),
    sectionId: idOf(user.sectionId),
    office: user.office ?? null,
    isHOD: !!user.isHOD,
    isCR: !!user.isCR,
  };
}

export function toPolicyGroup(group: GroupDoc): PolicyGroup {
  return {
    id: String(group._id),
    type: group.type,
    departmentId: idOf(group.departmentId),
    sectionId: idOf(group.sectionId),
    courseId: idOf(group.courseId),
    settings: group.settings,
  };
}

export function toPolicyMembership(
  membership: MembershipDoc | null | undefined,
): PolicyMembership | null {
  return membership ? { role: membership.role, mutedUntil: membership.mutedUntil } : null;
}
