/**
 * Communication-boundary policy engine.
 *
 * Pure functions with no I/O: the server is the authority and evaluates these on every
 * socket event and REST call; the web client evaluates the same rules only to explain
 * *why* something is disabled (e.g. a read-only composer in an announcement channel).
 */
import {
  GROUP_TYPE_LABELS,
  type GroupType,
  type JoinPolicy,
  MESSAGE_DELETE_WINDOW_MS,
  type MemberRole,
  type Office,
  type PostPolicy,
  type Role,
} from './constants';

export interface GroupSettings {
  postPolicy: PostPolicy;
  /** Used when postPolicy is 'roles': members with these system roles may post. */
  allowedPosterRoles: Role[];
  /** Empty means any role may be a member (subject to the group type's own rules). */
  eligibleRoles: Role[];
  /** Temporarily restrict posting to moderators (e.g. an instructor making a course announcement-only). */
  locked: boolean;
  joinPolicy: JoinPolicy;
}

export interface PolicyUser {
  id: string;
  role: Role;
  active: boolean;
  departmentId?: string | null;
  sectionId?: string | null;
  office?: Office | null;
  isHOD?: boolean;
  isCR?: boolean;
}

export interface PolicyGroup {
  id: string;
  type: GroupType;
  departmentId?: string | null;
  sectionId?: string | null;
  courseId?: string | null;
  settings: GroupSettings;
}

export interface PolicyMembership {
  role: MemberRole;
  mutedUntil?: Date | string | null;
}

export type DenyCode =
  | 'INACTIVE'
  | 'NOT_MEMBER'
  | 'ALREADY_MEMBER'
  | 'MUTED'
  | 'LOCKED'
  | 'POST_RESTRICTED'
  | 'NOT_ELIGIBLE'
  | 'INVITE_ONLY'
  | 'AUTO_MANAGED'
  | 'NOT_MODERATOR'
  | 'DM_RESTRICTED'
  | 'SELF';

export type Decision = { allowed: true } | { allowed: false; code: DenyCode; reason: string };

const ALLOW: Decision = { allowed: true };
const deny = (code: DenyCode, reason: string): Decision => ({ allowed: false, code, reason });

const MEMBER_RANK: Record<MemberRole, number> = { owner: 3, moderator: 2, member: 1 };

const ROLE_PLURALS: Record<Role, string> = {
  admin: 'admins',
  faculty: 'faculty',
  staff: 'staff',
  student: 'students',
};

export function isModeratorRole(role: MemberRole | null | undefined): boolean {
  return role === 'owner' || role === 'moderator';
}

export function isMuted(
  membership: PolicyMembership | null | undefined,
  now = new Date(),
): boolean {
  if (!membership?.mutedUntil) return false;
  return new Date(membership.mutedUntil).getTime() > now.getTime();
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

export function defaultGroupSettings(type: GroupType): GroupSettings {
  const base: GroupSettings = {
    postPolicy: 'all',
    allowedPosterRoles: [],
    eligibleRoles: [],
    locked: false,
    joinPolicy: 'auto',
  };
  switch (type) {
    case 'CAMPUS_ANNOUNCEMENT':
    case 'DEPARTMENT_ANNOUNCEMENT':
      return { ...base, postPolicy: 'moderators' };
    case 'FACULTY_LOUNGE':
      return { ...base, eligibleRoles: ['faculty', 'admin'] };
    case 'SECTION':
    case 'COURSE':
    case 'CR_COUNCIL':
      return { ...base, eligibleRoles: ['student', 'faculty', 'admin'] };
    case 'SOCIETY':
      return { ...base, joinPolicy: 'open' };
    case 'CUSTOM':
    case 'DIRECT':
      return { ...base, joinPolicy: 'invite' };
  }
}

/** Human-readable summary of who may post, shown as the group's policy badge. */
export function describePostPolicy(group: Pick<PolicyGroup, 'type' | 'settings'>): string {
  const { settings, type } = group;
  if (type === 'DIRECT') return 'Private conversation';
  if (settings.locked) return 'Locked: only moderators can post right now';
  switch (settings.postPolicy) {
    case 'all':
      return 'All members can post';
    case 'moderators':
      if (type === 'CAMPUS_ANNOUNCEMENT') {
        return "Official channel: only the Director's Office and IT can post";
      }
      if (type === 'DEPARTMENT_ANNOUNCEMENT') {
        return 'Notices: only the HOD and the department office can post';
      }
      return 'Only moderators can post';
    case 'roles': {
      const roles = settings.allowedPosterRoles.map((r) => ROLE_PLURALS[r]);
      return `Only ${joinWords([...roles, 'moderators'])} can post`;
    }
  }
}

export function canRead(
  user: PolicyUser,
  _group: PolicyGroup,
  membership: PolicyMembership | null | undefined,
): Decision {
  if (!user.active) return deny('INACTIVE', 'Your account is deactivated.');
  if (!membership) return deny('NOT_MEMBER', 'You are not a member of this group.');
  return ALLOW;
}

/**
 * Posting rule for group conversations. For DIRECT groups this only checks membership and
 * mutes; the server additionally evaluates {@link canDM} against the other participant.
 */
export function canPost(
  user: PolicyUser,
  group: PolicyGroup,
  membership: PolicyMembership | null | undefined,
  now = new Date(),
): Decision {
  if (!user.active) return deny('INACTIVE', 'Your account is deactivated.');
  if (!membership) return deny('NOT_MEMBER', 'Join this group to post.');
  if (isMuted(membership, now)) {
    const until = new Date(membership.mutedUntil as string | Date);
    const time = until.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return deny('MUTED', `A moderator muted you in this group until ${time}.`);
  }
  if (group.type === 'DIRECT') return ALLOW;

  const moderator = isModeratorRole(membership.role);
  if (group.settings.locked && !moderator) {
    return deny('LOCKED', 'This group is locked. Only moderators can post right now.');
  }
  switch (group.settings.postPolicy) {
    case 'all':
      return ALLOW;
    case 'moderators':
      return moderator ? ALLOW : deny('POST_RESTRICTED', `${describePostPolicy(group)}.`);
    case 'roles':
      return moderator || group.settings.allowedPosterRoles.includes(user.role)
        ? ALLOW
        : deny('POST_RESTRICTED', `${describePostPolicy(group)}.`);
  }
}

export interface MembershipFacts {
  /** For COURSE groups: whether the user is enrolled in (or teaches) the course offering. */
  enrolled?: boolean;
}

/** Whether `user` may hold a membership in `group` at all, regardless of who adds them. */
export function canBeMember(
  user: PolicyUser,
  group: PolicyGroup,
  facts: MembershipFacts = {},
): Decision {
  if (!user.active) return deny('INACTIVE', 'This account is deactivated.');
  if (group.type === 'DIRECT') {
    return deny('NOT_ELIGIBLE', 'Direct messages are started with the New message button.');
  }
  const { eligibleRoles } = group.settings;
  if (eligibleRoles.length && !eligibleRoles.includes(user.role)) {
    const roles = joinWords(eligibleRoles.map((r) => ROLE_PLURALS[r]));
    return deny('NOT_ELIGIBLE', `${GROUP_TYPE_LABELS[group.type]} is limited to ${roles}.`);
  }
  const sameDepartment = !!user.departmentId && user.departmentId === group.departmentId;
  switch (group.type) {
    case 'CAMPUS_ANNOUNCEMENT':
    case 'SOCIETY':
    case 'CUSTOM':
      return ALLOW;
    case 'DEPARTMENT_ANNOUNCEMENT':
      return user.role === 'admin' || sameDepartment
        ? ALLOW
        : deny('NOT_ELIGIBLE', 'Only members of this department receive its notices.');
    case 'FACULTY_LOUNGE':
      if (user.role === 'admin') return ALLOW;
      return user.role === 'faculty' && sameDepartment
        ? ALLOW
        : deny('NOT_ELIGIBLE', "The faculty lounge is only for the department's faculty.");
    case 'SECTION':
      if (user.role === 'admin' || user.role === 'faculty') return ALLOW;
      return user.role === 'student' && user.sectionId && user.sectionId === group.sectionId
        ? ALLOW
        : deny('NOT_ELIGIBLE', 'Only students registered in this section can join it.');
    case 'COURSE':
      if (user.role === 'admin' || user.role === 'faculty') return ALLOW;
      return user.role === 'student' && facts.enrolled
        ? ALLOW
        : deny('NOT_ELIGIBLE', 'Only students enrolled in this course can join it.');
    case 'CR_COUNCIL':
      if (user.role === 'admin') return ALLOW;
      if (user.role === 'faculty' && sameDepartment) return ALLOW;
      return user.role === 'student' && user.isCR && sameDepartment
        ? ALLOW
        : deny(
            'NOT_ELIGIBLE',
            'The CR council is for class representatives and faculty of the department.',
          );
  }
}

export function canJoin(
  user: PolicyUser,
  group: PolicyGroup,
  membership: PolicyMembership | null | undefined,
  facts: MembershipFacts = {},
): Decision {
  if (membership) return deny('ALREADY_MEMBER', 'You are already a member of this group.');
  if (group.settings.joinPolicy === 'auto') {
    return deny('AUTO_MANAGED', 'Membership of official groups is managed by the university.');
  }
  if (group.settings.joinPolicy !== 'open') {
    return deny('INVITE_ONLY', 'This group is invite-only.');
  }
  return canBeMember(user, group, facts);
}

export function canLeave(
  _user: PolicyUser,
  group: PolicyGroup,
  membership: PolicyMembership | null | undefined,
): Decision {
  if (!membership) return deny('NOT_MEMBER', 'You are not a member of this group.');
  if (group.type === 'DIRECT') return deny('AUTO_MANAGED', "Direct messages can't be left.");
  if (group.settings.joinPolicy === 'auto') {
    return deny('AUTO_MANAGED', "Official university groups can't be left.");
  }
  return ALLOW;
}

/** Lock/unlock, mute members and delete others' messages. */
export function canModerate(
  user: PolicyUser,
  group: PolicyGroup,
  membership: PolicyMembership | null | undefined,
): Decision {
  if (!user.active) return deny('INACTIVE', 'Your account is deactivated.');
  if (group.type === 'DIRECT') {
    return deny('NOT_MODERATOR', 'Direct messages have no moderators.');
  }
  if (user.role === 'admin' || isModeratorRole(membership?.role)) return ALLOW;
  return deny('NOT_MODERATOR', 'Only group moderators can do this.');
}

/** Add/remove members and change member roles. */
export function canManageMembers(
  user: PolicyUser,
  group: PolicyGroup,
  membership: PolicyMembership | null | undefined,
): Decision {
  if (!user.active) return deny('INACTIVE', 'Your account is deactivated.');
  if (group.type === 'DIRECT') {
    return deny('NOT_MODERATOR', "Direct message participants can't be changed.");
  }
  if (user.role === 'admin') return ALLOW;
  if ((group.type === 'SOCIETY' || group.type === 'CUSTOM') && isModeratorRole(membership?.role)) {
    return ALLOW;
  }
  return deny('NOT_MODERATOR', 'Membership of official groups is managed by the administration.');
}

/** Moderators may only mute members ranked below them; admins may mute anyone but owners. */
export function canMuteMember(
  actor: PolicyUser,
  group: PolicyGroup,
  actorMembership: PolicyMembership | null | undefined,
  target: { userId: string; membership: PolicyMembership },
): Decision {
  const moderate = canModerate(actor, group, actorMembership);
  if (!moderate.allowed) return moderate;
  if (target.userId === actor.id) return deny('SELF', "You can't mute yourself.");
  const targetRank = MEMBER_RANK[target.membership.role];
  if (actor.role === 'admin') {
    return targetRank < MEMBER_RANK.owner
      ? ALLOW
      : deny('NOT_MODERATOR', "The group owner can't be muted.");
  }
  const actorRank = actorMembership ? MEMBER_RANK[actorMembership.role] : 0;
  return actorRank > targetRank
    ? ALLOW
    : deny('NOT_MODERATOR', 'You can only mute members ranked below you.');
}

export function canDeleteMessage(
  user: PolicyUser,
  group: PolicyGroup,
  membership: PolicyMembership | null | undefined,
  message: { senderId: string; createdAt: Date | string },
  now = new Date(),
): Decision {
  if (!user.active) return deny('INACTIVE', 'Your account is deactivated.');
  const ownWithinWindow =
    message.senderId === user.id &&
    now.getTime() - new Date(message.createdAt).getTime() <= MESSAGE_DELETE_WINDOW_MS;
  if (ownWithinWindow && membership) return ALLOW;
  if (group.type !== 'DIRECT' && canModerate(user, group, membership).allowed) return ALLOW;
  return deny('NOT_MODERATOR', 'You can only delete your own messages within 15 minutes.');
}

/** Relationship facts the server derives from the database before evaluating {@link canDM}. */
export interface DMFacts {
  sameDepartment: boolean;
  /** Share a section, course, society, CR council or custom group (announcement channels don't count). */
  sharedGroup: boolean;
  /** The faculty participant teaches the student participant in a course offering. */
  facultyTeachesStudent: boolean;
  /** The faculty participant is the batch advisor of the student participant's section. */
  facultyAdvisesStudent: boolean;
  /** An existing conversation was started by the recipient, so the sender may reply. */
  threadStartedByRecipient: boolean;
}

export const NO_DM_FACTS: DMFacts = {
  sameDepartment: false,
  sharedGroup: false,
  facultyTeachesStudent: false,
  facultyAdvisesStudent: false,
  threadStartedByRecipient: false,
};

/**
 * Direct-message boundaries:
 * - admin and staff (offices) may message anyone, and anyone may message an office;
 * - faculty may message faculty/admin, and students of their department or whom they teach;
 * - students may message their instructors, batch advisor or HOD, and students who share their
 *   department or a group; students can't message IT admins directly;
 * - anyone may reply in a conversation the other person legitimately started.
 */
export function canDM(sender: PolicyUser, recipient: PolicyUser, facts: DMFacts): Decision {
  if (sender.id === recipient.id) return deny('SELF', "You can't message yourself.");
  if (!sender.active) return deny('INACTIVE', 'Your account is deactivated.');
  if (!recipient.active) return deny('DM_RESTRICTED', 'This account is deactivated.');
  if (facts.threadStartedByRecipient) return ALLOW;
  if (sender.role === 'admin' || sender.role === 'staff' || recipient.role === 'staff') {
    return ALLOW;
  }

  if (sender.role === 'faculty') {
    if (recipient.role !== 'student') return ALLOW;
    return facts.sameDepartment || facts.facultyTeachesStudent || facts.facultyAdvisesStudent
      ? ALLOW
      : deny(
          'DM_RESTRICTED',
          'Faculty can message students of their own department or students they teach.',
        );
  }

  // sender is a student
  switch (recipient.role) {
    case 'admin':
      return deny(
        'DM_RESTRICTED',
        "Students can't message IT administrators directly. Contact the relevant office instead.",
      );
    case 'faculty':
      return facts.facultyTeachesStudent ||
        facts.facultyAdvisesStudent ||
        (recipient.isHOD && facts.sameDepartment)
        ? ALLOW
        : deny(
            'DM_RESTRICTED',
            'Students can message only their own instructors, batch advisor or HOD.',
          );
    default:
      return facts.sameDepartment || facts.sharedGroup
        ? ALLOW
        : deny(
            'DM_RESTRICTED',
            'Students can message classmates, department peers or fellow group members only.',
          );
  }
}
