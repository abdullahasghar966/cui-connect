/**
 * Provisioning: university structure (departments, sections, course offerings, roles) is the
 * source of truth for "official" groups. Creating structure creates groups; reconciling a user
 * computes which official groups they belong to, and with which role, and applies the diff live.
 */
import { defaultGroupSettings, type GroupType, type MemberRole } from '@cui/shared';
import { isDuplicateKeyError } from '../lib/errors';
import {
  CourseOffering,
  type CourseOfferingDoc,
  type DepartmentDoc,
  Group,
  type GroupDoc,
  Membership,
  type MembershipDoc,
  Section,
  type SectionDoc,
  User,
  type UserDoc,
} from '../models';
import {
  broadcastMemberUpdated,
  notifyMembershipAdded,
  notifyMembershipRemoved,
} from '../realtime/notifier';
import type { Id } from './mappers';

export const groupKeys = {
  campus: () => 'CAMPUS',
  deptNotices: (departmentId: Id) => `DEPT_NOTICES:${departmentId}`,
  lounge: (departmentId: Id) => `LOUNGE:${departmentId}`,
  crCouncil: (departmentId: Id) => `CR:${departmentId}`,
  section: (sectionId: Id) => `SECTION:${sectionId}`,
  course: (courseId: Id) => `COURSE:${courseId}`,
  dm: (a: Id, b: Id) => `DM:${[String(a), String(b)].sort().join(':')}`,
};

const RANK: Record<MemberRole, number> = { owner: 3, moderator: 2, member: 1 };

type GroupSeed = Pick<GroupDoc, 'name' | 'type'> &
  Partial<Pick<GroupDoc, 'description' | 'departmentId' | 'sectionId' | 'courseId'>>;

/** Idempotently creates a provisioned group identified by `key`. */
async function ensureGroup(key: string, seed: GroupSeed): Promise<GroupDoc> {
  const upsert = () =>
    Group.findOneAndUpdate(
      { key },
      {
        $setOnInsert: {
          key,
          system: true,
          settings: defaultGroupSettings(seed.type as GroupType),
          ...seed,
        },
      },
      { upsert: true, returnDocument: 'after' },
    ).lean<GroupDoc>();
  try {
    const group = await upsert();
    if (!group) throw new Error(`Failed to provision group ${key}`);
    return group;
  } catch (err) {
    // Two concurrent upserts can race on the unique key; the loser simply re-reads.
    if (!isDuplicateKeyError(err)) throw err;
    const group = await Group.findOne({ key }).lean<GroupDoc>();
    if (!group) throw err;
    return group;
  }
}

export function ensureCampusGroup(): Promise<GroupDoc> {
  return ensureGroup(groupKeys.campus(), {
    name: 'CUI Islamabad Official',
    type: 'CAMPUS_ANNOUNCEMENT',
    description: "Official announcements from the Director's Office and IT Services.",
  });
}

export async function provisionDepartment(dept: DepartmentDoc): Promise<GroupDoc[]> {
  return Promise.all([
    ensureGroup(groupKeys.deptNotices(dept._id), {
      name: `${dept.code} Department Notices`,
      type: 'DEPARTMENT_ANNOUNCEMENT',
      departmentId: dept._id,
      description: `Official notices from the ${dept.name}.`,
    }),
    ensureGroup(groupKeys.lounge(dept._id), {
      name: `${dept.code} Faculty Lounge`,
      type: 'FACULTY_LOUNGE',
      departmentId: dept._id,
      description: `Private discussion space for ${dept.code} faculty.`,
    }),
    ensureGroup(groupKeys.crCouncil(dept._id), {
      name: `${dept.code} CR Council`,
      type: 'CR_COUNCIL',
      departmentId: dept._id,
      description: `Class representatives of ${dept.code} coordinating with the HOD.`,
    }),
  ]);
}

export function provisionSection(section: SectionDoc): Promise<GroupDoc> {
  return ensureGroup(groupKeys.section(section._id), {
    name: `${section.name} Class`,
    type: 'SECTION',
    departmentId: section.departmentId,
    sectionId: section._id,
    description: `Class group for ${section.name} (${section.intake} intake).`,
  });
}

export function provisionCourse(course: CourseOfferingDoc, section: SectionDoc): Promise<GroupDoc> {
  return ensureGroup(groupKeys.course(course._id), {
    name: `${course.title} · ${section.name}`,
    type: 'COURSE',
    departmentId: section.departmentId,
    sectionId: section._id,
    courseId: course._id,
    description: `${course.code} ${course.title} for ${section.name}.`,
  });
}

/** Which official groups `user` belongs to, keyed by group key, with their member role. */
async function desiredAutoMemberships(user: UserDoc): Promise<Map<string, MemberRole>> {
  const wanted = new Map<string, MemberRole>();
  const want = (key: string, role: MemberRole) => {
    const previous = wanted.get(key);
    if (!previous || RANK[role] > RANK[previous]) wanted.set(key, role);
  };

  const campusRole: MemberRole =
    user.role === 'admin'
      ? 'owner'
      : user.role === 'staff' && user.office === 'DIRECTOR'
        ? 'moderator'
        : 'member';
  want(groupKeys.campus(), campusRole);

  const dept = user.departmentId;
  if (dept) {
    const departmentOffice = user.role === 'staff' && user.office === 'DEPARTMENT';
    want(groupKeys.deptNotices(dept), user.isHOD || departmentOffice ? 'moderator' : 'member');
    if (user.role === 'faculty') {
      want(groupKeys.lounge(dept), user.isHOD ? 'owner' : 'member');
      if (user.isHOD) want(groupKeys.crCouncil(dept), 'owner');
    }
    if (user.role === 'student' && user.isCR) want(groupKeys.crCouncil(dept), 'member');
  }

  if (user.role === 'student') {
    if (user.sectionId) want(groupKeys.section(user.sectionId), 'member');
    const courses = await CourseOffering.find({ studentIds: user._id }).select('_id').lean();
    for (const c of courses) want(groupKeys.course(c._id), 'member');
  }

  if (user.role === 'faculty') {
    const [advised, taught] = await Promise.all([
      Section.find({ batchAdvisorId: user._id }).select('_id').lean(),
      CourseOffering.find({ instructorId: user._id }).select('_id').lean(),
    ]);
    for (const s of advised) want(groupKeys.section(s._id), 'moderator');
    for (const c of taught) want(groupKeys.course(c._id), 'owner');
  }

  return wanted;
}

export interface ReconcileResult {
  added: number;
  removed: number;
  updated: number;
}

/**
 * Applies the difference between a user's current automatic memberships and the ones the
 * university structure implies. Manual memberships are never touched. With `notify`, live
 * sockets join/leave rooms immediately and sidebars update without a refresh.
 */
export async function reconcileUser(
  userId: Id,
  { notify = true }: { notify?: boolean } = {},
): Promise<ReconcileResult> {
  const result: ReconcileResult = { added: 0, removed: 0, updated: 0 };
  const user = await User.findById(userId).lean<UserDoc>();
  if (!user?.active) return result;

  const wanted = await desiredAutoMemberships(user);
  const groups = await Group.find({ key: { $in: [...wanted.keys()] } })
    .select('_id key')
    .lean<Pick<GroupDoc, '_id' | 'key'>[]>();
  const desired = new Map<string, MemberRole>();
  for (const g of groups) {
    const role = g.key ? wanted.get(g.key) : undefined;
    if (role) desired.set(String(g._id), role);
  }

  const existing = await Membership.find({ userId: user._id }).lean<MembershipDoc[]>();
  const existingByGroup = new Map(existing.map((m) => [String(m.groupId), m]));

  const toAdd: [string, MemberRole][] = [];
  const toUpdate: [MembershipDoc, MemberRole][] = [];
  for (const [groupId, role] of desired) {
    const current = existingByGroup.get(groupId);
    if (!current) toAdd.push([groupId, role]);
    else if (current.source === 'auto' && current.role !== role) toUpdate.push([current, role]);
  }
  const toRemove = existing.filter((m) => m.source === 'auto' && !desired.has(String(m.groupId)));

  if (toAdd.length) {
    try {
      await Membership.insertMany(
        toAdd.map(([groupId, role]) => ({ groupId, userId: user._id, role, source: 'auto' })),
        { ordered: false },
      );
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
    }
  }
  if (toUpdate.length) {
    await Membership.bulkWrite(
      toUpdate.map(([m, role]) => ({
        updateOne: { filter: { _id: m._id }, update: { $set: { role } } },
      })),
    );
  }
  if (toRemove.length) {
    await Membership.deleteMany({ _id: { $in: toRemove.map((m) => m._id) } });
  }

  result.added = toAdd.length;
  result.updated = toUpdate.length;
  result.removed = toRemove.length;

  if (notify) {
    const uid = String(user._id);
    await Promise.all(toAdd.map(([groupId]) => notifyMembershipAdded(uid, groupId)));
    for (const [m, role] of toUpdate) {
      broadcastMemberUpdated({ groupId: String(m.groupId), userId: uid, role });
    }
    for (const m of toRemove) {
      notifyMembershipRemoved(uid, String(m.groupId), 'Your enrollment or role changed.');
    }
  }
  return result;
}

export async function reconcileUsers(userIds: Id[], options?: { notify?: boolean }) {
  const unique = [...new Set(userIds.map(String))];
  for (const id of unique) await reconcileUser(id, options);
}
