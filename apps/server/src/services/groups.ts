import type { AdminGroupDTO, GroupDTO, MemberDTO, MessageDTO } from '@cui/shared';
import type { Types } from 'mongoose';
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
import { getOrgLookup, type Id, idOf, toMessageDTO, toObjectId, toPublicUserDTO } from './mappers';

const UNREAD_CAP = 100;

export async function countMembers(groupIds: Types.ObjectId[]): Promise<Map<string, number>> {
  if (!groupIds.length) return new Map();
  const rows = await Membership.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { groupId: { $in: groupIds } } },
    { $group: { _id: '$groupId', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

/**
 * Builds the per-viewer view of the user's groups: role, mute, unread count (capped),
 * last message and, for DMs, the other participant.
 */
export async function buildGroupDTOs(userId: Id, onlyGroupIds?: Id[]): Promise<GroupDTO[]> {
  const uid = toObjectId(userId);
  const memberships = await Membership.find({
    userId: uid,
    ...(onlyGroupIds ? { groupId: { $in: onlyGroupIds.map(toObjectId) } } : {}),
  }).lean<MembershipDoc[]>();
  if (!memberships.length) return [];

  const groupIds = memberships.map((m) => m.groupId);
  const groups = await Group.find({ _id: { $in: groupIds } }).lean<GroupDoc[]>();
  const groupById = new Map(groups.map((g) => [String(g._id), g]));
  const dmIds = groups.filter((g) => g.type === 'DIRECT').map((g) => g._id);

  const [counts, peerMemberships, lastMessages, unread] = await Promise.all([
    countMembers(groupIds),
    dmIds.length
      ? Membership.find({ groupId: { $in: dmIds }, userId: { $ne: uid } }).lean<MembershipDoc[]>()
      : Promise.resolve([] as MembershipDoc[]),
    Promise.all(
      groups.map((g) => Message.findOne({ groupId: g._id }).sort({ _id: -1 }).lean<MessageDoc>()),
    ),
    Promise.all(
      memberships.map((m) =>
        Message.countDocuments({
          groupId: m.groupId,
          senderId: { $ne: uid },
          deletedAt: null,
          ...(m.lastReadMessageId ? { _id: { $gt: m.lastReadMessageId } } : {}),
        }).limit(UNREAD_CAP),
      ),
    ),
  ]);

  const lastByGroup = new Map<string, MessageDoc>();
  for (const message of lastMessages)
    if (message) lastByGroup.set(String(message.groupId), message);
  const peerByGroup = new Map(peerMemberships.map((p) => [String(p.groupId), p]));

  const userIds = new Set<string>();
  for (const p of peerMemberships) userIds.add(String(p.userId));
  for (const m of lastByGroup.values()) userIds.add(String(m.senderId));
  const [users, org] = await Promise.all([
    User.find({ _id: { $in: [...userIds] } }).lean<UserDoc[]>(),
    getOrgLookup(),
  ]);
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const result: GroupDTO[] = [];
  memberships.forEach((membership, index) => {
    const gid = String(membership.groupId);
    const group = groupById.get(gid);
    if (!group) return;
    const last = lastByGroup.get(gid);
    const lastMessage: MessageDTO | null = last
      ? toMessageDTO(last, userById.get(String(last.senderId)))
      : null;
    const peerMembership = peerByGroup.get(gid);
    const peerUser = peerMembership ? userById.get(String(peerMembership.userId)) : undefined;
    const peer = peerUser ? toPublicUserDTO(peerUser, org) : null;
    result.push({
      id: gid,
      name: group.type === 'DIRECT' ? (peer?.name ?? 'Direct message') : group.name,
      description: group.description ?? null,
      type: group.type,
      system: group.system,
      departmentId: idOf(group.departmentId),
      sectionId: idOf(group.sectionId),
      courseId: idOf(group.courseId),
      settings: group.settings,
      createdById: idOf(group.createdById),
      memberCount: counts.get(gid) ?? 0,
      lastMessage,
      lastMessageAt: group.lastMessageAt?.toISOString() ?? null,
      myRole: membership.role,
      mutedUntil: membership.mutedUntil?.toISOString() ?? null,
      lastReadMessageId: idOf(membership.lastReadMessageId),
      unread: unread[index] ?? 0,
      peer,
      peerLastReadMessageId: idOf(peerMembership?.lastReadMessageId),
    });
  });

  return result.sort(
    (a, b) =>
      (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '') || a.name.localeCompare(b.name),
  );
}

export async function buildGroupDTO(userId: Id, groupId: Id): Promise<GroupDTO | null> {
  const [dto] = await buildGroupDTOs(userId, [groupId]);
  return dto ?? null;
}

const MEMBER_ORDER = { owner: 0, moderator: 1, member: 2 } as const;
const ROLE_ORDER = { admin: 0, faculty: 1, staff: 2, student: 3 } as const;

export async function listMembers(groupId: Id): Promise<MemberDTO[]> {
  const memberships = await Membership.find({ groupId: toObjectId(groupId) }).lean<
    MembershipDoc[]
  >();
  const [users, org] = await Promise.all([
    User.find({ _id: { $in: memberships.map((m) => m.userId) } }).lean<UserDoc[]>(),
    getOrgLookup(),
  ]);
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const members: MemberDTO[] = [];
  for (const m of memberships) {
    const user = userById.get(String(m.userId));
    if (!user) continue;
    members.push(toMemberDTO(m, user, org));
  }
  return members.sort(
    (a, b) =>
      MEMBER_ORDER[a.role] - MEMBER_ORDER[b.role] ||
      ROLE_ORDER[a.user.role] - ROLE_ORDER[b.user.role] ||
      a.user.name.localeCompare(b.user.name),
  );
}

export function toMemberDTO(
  membership: MembershipDoc,
  user: UserDoc,
  org: Awaited<ReturnType<typeof getOrgLookup>>,
): MemberDTO {
  return {
    user: toPublicUserDTO(user, org),
    role: membership.role,
    mutedUntil: membership.mutedUntil?.toISOString() ?? null,
    source: membership.source,
    joinedAt: membership.createdAt.toISOString(),
  };
}

export function toAdminGroupDTO(group: GroupDoc, memberCount: number): AdminGroupDTO {
  return {
    id: String(group._id),
    name: group.name,
    description: group.description ?? null,
    type: group.type,
    system: group.system,
    settings: group.settings,
    memberCount,
    lastMessageAt: group.lastMessageAt?.toISOString() ?? null,
  };
}
