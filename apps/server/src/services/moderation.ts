/** Group-level operations shared by the REST API and Socket.IO handlers. */
import {
  canBeMember,
  canJoin,
  canLeave,
  canManageMembers,
  canModerate,
  canMuteMember,
  type GroupDTO,
  type GroupSettings,
  type MemberDTO,
  type MemberRole,
  type UpdateGroupInput,
} from '@cui/shared';
import { assertAllowed, badRequest, conflict, isDuplicateKeyError, notFound } from '../lib/errors';
import {
  CourseOffering,
  Group,
  type GroupDoc,
  Membership,
  type MembershipDoc,
  User,
  type UserDoc,
} from '../models';
import {
  broadcastGroupUpdated,
  broadcastMemberUpdated,
  notifyMembershipAdded,
  notifyMembershipRemoved,
} from '../realtime/notifier';
import { recordAudit } from './audit';
import { buildGroupDTO, countMembers, toMemberDTO } from './groups';
import { getOrgLookup, toPolicyGroup, toPolicyMembership, toPolicyUser } from './mappers';

async function load(user: UserDoc, groupId: string) {
  const [group, membership] = await Promise.all([
    Group.findById(groupId).lean<GroupDoc>(),
    Membership.findOne({ groupId, userId: user._id }).lean<MembershipDoc>(),
  ]);
  if (!group) throw notFound('This group no longer exists.');
  return { group, membership, policyGroup: toPolicyGroup(group) };
}

async function isEnrolled(group: GroupDoc, userId: UserDoc['_id']): Promise<boolean> {
  if (group.type !== 'COURSE' || !group.courseId) return false;
  return !!(await CourseOffering.exists({ _id: group.courseId, studentIds: userId }));
}

async function memberCountOf(group: GroupDoc): Promise<number> {
  return (await countMembers([group._id])).get(String(group._id)) ?? 0;
}

export async function setLocked(
  user: UserDoc,
  groupId: string,
  locked: boolean,
): Promise<GroupSettings> {
  const { group, membership, policyGroup } = await load(user, groupId);
  assertAllowed(canModerate(toPolicyUser(user), policyGroup, toPolicyMembership(membership)));
  const settings: GroupSettings = { ...group.settings, locked };
  await Group.updateOne({ _id: group._id }, { $set: { 'settings.locked': locked } });
  broadcastGroupUpdated({ groupId, settings });
  void recordAudit({
    action: locked ? 'group.locked' : 'group.unlocked',
    actor: user,
    summary: `${user.name} ${locked ? 'locked' : 'unlocked'} "${group.name}"`,
    targetType: 'group',
    targetId: group._id,
  });
  return settings;
}

export async function updateGroup(
  user: UserDoc,
  groupId: string,
  input: UpdateGroupInput,
): Promise<void> {
  const { group, membership, policyGroup } = await load(user, groupId);
  assertAllowed(canModerate(toPolicyUser(user), policyGroup, toPolicyMembership(membership)));
  if (group.system && input.name && input.name !== group.name) {
    throw badRequest('Official university groups cannot be renamed.');
  }
  const settings: GroupSettings = { ...group.settings, ...input.settings };
  if (group.system && input.settings?.joinPolicy && input.settings.joinPolicy !== 'auto') {
    throw badRequest('Membership of official groups is always managed automatically.');
  }
  await Group.updateOne(
    { _id: group._id },
    {
      $set: {
        settings,
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    },
  );
  broadcastGroupUpdated({
    groupId,
    settings,
    ...(input.name ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
  });
  void recordAudit({
    action: 'group.updated',
    actor: user,
    summary: `${user.name} updated the settings of "${input.name ?? group.name}"`,
    targetType: 'group',
    targetId: group._id,
    meta: { settings },
  });
}

export async function muteMember(
  user: UserDoc,
  input: { groupId: string; userId: string; minutes: number },
): Promise<MemberDTO> {
  const { group, membership, policyGroup } = await load(user, input.groupId);
  const target = await Membership.findOne({
    groupId: group._id,
    userId: input.userId,
  }).lean<MembershipDoc>();
  if (!target) throw notFound('That person is not a member of this group.');
  assertAllowed(
    canMuteMember(toPolicyUser(user), policyGroup, toPolicyMembership(membership), {
      userId: input.userId,
      membership: { role: target.role, mutedUntil: target.mutedUntil },
    }),
  );
  const mutedUntil = input.minutes > 0 ? new Date(Date.now() + input.minutes * 60_000) : null;
  await Membership.updateOne({ _id: target._id }, { $set: { mutedUntil } });
  const [targetUser, org] = await Promise.all([
    User.findById(input.userId).lean<UserDoc>(),
    getOrgLookup(),
  ]);
  if (!targetUser) throw notFound('User not found.');
  broadcastMemberUpdated({
    groupId: input.groupId,
    userId: input.userId,
    mutedUntil: mutedUntil?.toISOString() ?? null,
  });
  void recordAudit({
    action: mutedUntil ? 'member.muted' : 'member.unmuted',
    actor: user,
    summary: mutedUntil
      ? `${user.name} muted ${targetUser.name} in "${group.name}" for ${input.minutes} min`
      : `${user.name} unmuted ${targetUser.name} in "${group.name}"`,
    targetType: 'group',
    targetId: group._id,
  });
  return toMemberDTO({ ...target, mutedUntil }, targetUser, org);
}

export async function joinGroup(user: UserDoc, groupId: string): Promise<GroupDTO> {
  const { group, membership, policyGroup } = await load(user, groupId);
  assertAllowed(
    canJoin(toPolicyUser(user), policyGroup, toPolicyMembership(membership), {
      enrolled: await isEnrolled(group, user._id),
    }),
  );
  try {
    await Membership.create({ groupId: group._id, userId: user._id, source: 'manual' });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
  }
  await notifyMembershipAdded(String(user._id), groupId);
  broadcastGroupUpdated({ groupId, memberCount: await memberCountOf(group) });
  void recordAudit({
    action: 'member.joined',
    actor: user,
    summary: `${user.name} joined "${group.name}"`,
    targetType: 'group',
    targetId: group._id,
  });
  const dto = await buildGroupDTO(user._id, group._id);
  if (!dto) throw notFound('Could not join the group.');
  return dto;
}

export async function leaveGroup(user: UserDoc, groupId: string): Promise<void> {
  const { group, membership, policyGroup } = await load(user, groupId);
  assertAllowed(canLeave(toPolicyUser(user), policyGroup, toPolicyMembership(membership)));
  await Membership.deleteOne({ groupId: group._id, userId: user._id });
  notifyMembershipRemoved(String(user._id), groupId, 'You left this group.');
  broadcastGroupUpdated({ groupId, memberCount: await memberCountOf(group) });
}

export async function addMember(
  actor: UserDoc,
  groupId: string,
  input: { userId: string; role: MemberRole },
): Promise<MemberDTO> {
  const { group, membership, policyGroup } = await load(actor, groupId);
  assertAllowed(canManageMembers(toPolicyUser(actor), policyGroup, toPolicyMembership(membership)));
  const target = await User.findById(input.userId).lean<UserDoc>();
  if (!target) throw notFound('That user does not exist.');
  assertAllowed(
    canBeMember(toPolicyUser(target), policyGroup, {
      enrolled: await isEnrolled(group, target._id),
    }),
  );
  if (input.role === 'owner' && actor.role !== 'admin') {
    throw badRequest('Only administrators can assign group owners.');
  }
  let created: MembershipDoc;
  try {
    const doc = await Membership.create({
      groupId: group._id,
      userId: target._id,
      role: input.role,
      source: 'manual',
    });
    created = doc.toObject<MembershipDoc>();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw conflict(`${target.name} is already a member.`);
    throw err;
  }
  await notifyMembershipAdded(String(target._id), groupId);
  broadcastGroupUpdated({ groupId, memberCount: await memberCountOf(group) });
  void recordAudit({
    action: 'member.added',
    actor,
    summary: `${actor.name} added ${target.name} to "${group.name}" as ${input.role}`,
    targetType: 'group',
    targetId: group._id,
  });
  return toMemberDTO(created, target, await getOrgLookup());
}

export async function removeMember(actor: UserDoc, groupId: string, userId: string) {
  const { group, membership, policyGroup } = await load(actor, groupId);
  assertAllowed(canManageMembers(toPolicyUser(actor), policyGroup, toPolicyMembership(membership)));
  const target = await Membership.findOne({ groupId: group._id, userId }).lean<MembershipDoc>();
  if (!target) throw notFound('That person is not a member of this group.');
  if (target.source === 'auto') {
    throw conflict(
      'This membership comes from university records (section, enrollment or role). Change it under Structure or Users instead.',
    );
  }
  if (target.role === 'owner' && actor.role !== 'admin') {
    throw badRequest('Only administrators can remove a group owner.');
  }
  await Membership.deleteOne({ _id: target._id });
  notifyMembershipRemoved(userId, groupId, `You were removed from "${group.name}".`);
  broadcastGroupUpdated({ groupId, memberCount: await memberCountOf(group) });
  const targetUser = await User.findById(userId).select('name').lean<Pick<UserDoc, 'name'>>();
  void recordAudit({
    action: 'member.removed',
    actor,
    summary: `${actor.name} removed ${targetUser?.name ?? 'a member'} from "${group.name}"`,
    targetType: 'group',
    targetId: group._id,
  });
}

export async function setMemberRole(
  actor: UserDoc,
  groupId: string,
  userId: string,
  role: MemberRole,
): Promise<void> {
  const { group, membership, policyGroup } = await load(actor, groupId);
  assertAllowed(canManageMembers(toPolicyUser(actor), policyGroup, toPolicyMembership(membership)));
  if (role === 'owner' && actor.role !== 'admin') {
    throw badRequest('Only administrators can assign group owners.');
  }
  const target = await Membership.findOne({ groupId: group._id, userId }).lean<MembershipDoc>();
  if (!target) throw notFound('That person is not a member of this group.');
  if (target.source === 'auto') {
    throw conflict(
      'Roles in official groups follow university records and cannot be changed here.',
    );
  }
  await Membership.updateOne({ _id: target._id }, { $set: { role } });
  broadcastMemberUpdated({ groupId, userId, role });
  void recordAudit({
    action: 'member.role',
    actor,
    summary: `${actor.name} changed a member's role in "${group.name}" to ${role}`,
    targetType: 'group',
    targetId: group._id,
  });
}
