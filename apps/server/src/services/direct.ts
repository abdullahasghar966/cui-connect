/** Direct messages: relationship facts for the DM policy, the people directory and DM threads. */
import {
  canDM,
  type DMFacts,
  defaultGroupSettings,
  type GroupDTO,
  type GroupType,
  NO_DM_FACTS,
  type PublicUserDTO,
} from '@cui/shared';
import { badRequest, forbidden, isDuplicateKeyError, notFound } from '../lib/errors';
import {
  CourseOffering,
  Group,
  type GroupDoc,
  Membership,
  Section,
  type SectionDoc,
  User,
  type UserDoc,
} from '../models';
import { joinUsersToGroup } from '../realtime/notifier';
import { recordAudit } from './audit';
import { buildGroupDTO } from './groups';
import { getOrgLookup, sameId, toPolicyUser, toPublicUserDTO } from './mappers';
import { groupKeys } from './provisioning';

/** Conversation groups that make two people "know each other" (announcement channels don't). */
const SHARED_GROUP_TYPES: GroupType[] = [
  'SECTION',
  'COURSE',
  'SOCIETY',
  'CR_COUNCIL',
  'CUSTOM',
  'FACULTY_LOUNGE',
];

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function facultyStudentPair(a: UserDoc, b: UserDoc): [UserDoc, UserDoc] | null {
  if (a.role === 'faculty' && b.role === 'student') return [a, b];
  if (a.role === 'student' && b.role === 'faculty') return [b, a];
  return null;
}

/**
 * Computes only the facts the DM policy needs for this pair (at most two small queries).
 * `thread` is the existing conversation, if any, for the reply rule.
 */
export async function computeDMFacts(
  sender: UserDoc,
  recipient: UserDoc,
  thread: Pick<GroupDoc, 'createdById'> | null,
): Promise<DMFacts> {
  const facts: DMFacts = {
    ...NO_DM_FACTS,
    sameDepartment: sameId(sender.departmentId, recipient.departmentId),
    threadStartedByRecipient: !!thread && sameId(thread.createdById, recipient._id),
  };
  if (facts.threadStartedByRecipient) return facts;

  const pair = facultyStudentPair(sender, recipient);
  if (pair) {
    const [faculty, student] = pair;
    const [teaches, advises] = await Promise.all([
      CourseOffering.exists({ instructorId: faculty._id, studentIds: student._id }),
      student.sectionId
        ? Section.exists({ _id: student.sectionId, batchAdvisorId: faculty._id })
        : Promise.resolve(null),
    ]);
    facts.facultyTeachesStudent = !!teaches;
    facts.facultyAdvisesStudent = !!advises;
  }

  if (sender.role === 'student' && recipient.role === 'student' && !facts.sameDepartment) {
    const senderGroups = await Membership.find({ userId: sender._id }).distinct('groupId');
    const conversational = await Group.find({
      _id: { $in: senderGroups },
      type: { $in: SHARED_GROUP_TYPES },
    }).distinct('_id');
    facts.sharedGroup = !!(await Membership.exists({
      userId: recipient._id,
      groupId: { $in: conversational },
    }));
  }
  return facts;
}

/** Precomputes the viewer's relationships so many candidates can be checked cheaply. */
async function buildDMContext(me: UserDoc): Promise<(other: UserDoc) => DMFacts> {
  const myGroupIds = await Membership.find({ userId: me._id }).distinct('groupId');
  const [conversational, startedByOthers] = await Promise.all([
    Group.find({ _id: { $in: myGroupIds }, type: { $in: SHARED_GROUP_TYPES } }).distinct('_id'),
    Group.find({ _id: { $in: myGroupIds }, type: 'DIRECT', createdById: { $ne: me._id } }).distinct(
      'createdById',
    ),
  ]);
  const coMembers = new Set(
    (
      await Membership.find({ groupId: { $in: conversational }, userId: { $ne: me._id } }).distinct(
        'userId',
      )
    ).map(String),
  );
  const repliable = new Set(startedByOthers.map(String));

  const teaching = new Set<string>();
  const advising = new Set<string>();
  if (me.role === 'faculty') {
    const [taughtStudents, advisedSections] = await Promise.all([
      CourseOffering.find({ instructorId: me._id }).distinct('studentIds'),
      Section.find({ batchAdvisorId: me._id }).distinct('_id'),
    ]);
    for (const id of taughtStudents) teaching.add(String(id));
    if (advisedSections.length) {
      const advisees = await User.find({
        sectionId: { $in: advisedSections },
        role: 'student',
      }).distinct('_id');
      for (const id of advisees) advising.add(String(id));
    }
  } else if (me.role === 'student') {
    const instructors = await CourseOffering.find({ studentIds: me._id }).distinct('instructorId');
    for (const id of instructors) teaching.add(String(id));
    if (me.sectionId) {
      const section = await Section.findById(me.sectionId)
        .select('batchAdvisorId')
        .lean<Pick<SectionDoc, 'batchAdvisorId'>>();
      if (section?.batchAdvisorId) advising.add(String(section.batchAdvisorId));
    }
  }

  return (other) => {
    const id = String(other._id);
    const pair = !!facultyStudentPair(me, other);
    return {
      sameDepartment: sameId(me.departmentId, other.departmentId),
      sharedGroup: coMembers.has(id),
      facultyTeachesStudent: pair && teaching.has(id),
      facultyAdvisesStudent: pair && advising.has(id),
      threadStartedByRecipient: repliable.has(id),
    };
  };
}

/** People the viewer is allowed to start a conversation with, optionally filtered by `q`. */
export async function listDirectory(me: UserDoc, q: string): Promise<PublicUserDTO[]> {
  const filter: Record<string, unknown> = { _id: { $ne: me._id }, active: true };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { regNo: rx }];
  }
  const [candidates, factsFor, org] = await Promise.all([
    User.find(filter).sort({ name: 1 }).limit(400).lean<UserDoc[]>(),
    buildDMContext(me),
    getOrgLookup(),
  ]);
  const self = toPolicyUser(me);
  return candidates
    .filter((c) => canDM(self, toPolicyUser(c), factsFor(c)).allowed)
    .slice(0, 60)
    .map((c) => toPublicUserDTO(c, org));
}

/** Returns the existing DM thread with `peerId`, or creates one if the DM policy allows. */
export async function openDirect(me: UserDoc, peerId: string): Promise<GroupDTO> {
  if (sameId(me._id, peerId)) throw badRequest("You can't message yourself.");
  const peer = await User.findById(peerId).lean<UserDoc>();
  if (!peer) throw notFound('That user does not exist.');

  const key = groupKeys.dm(me._id, peer._id);
  let thread = await Group.findOne({ key }).lean<GroupDoc>();
  if (!thread) {
    const decision = canDM(
      toPolicyUser(me),
      toPolicyUser(peer),
      await computeDMFacts(me, peer, null),
    );
    if (!decision.allowed) {
      void recordAudit({
        action: 'dm.denied',
        severity: 'warning',
        actor: me,
        summary: `${me.name} was blocked from messaging ${peer.name}: ${decision.reason}`,
        targetType: 'user',
        targetId: peer._id,
      });
      throw forbidden(decision.reason, { reason: decision.code });
    }
    try {
      const created = await Group.create({
        name: 'Direct message',
        type: 'DIRECT',
        key,
        system: false,
        settings: defaultGroupSettings('DIRECT'),
        createdById: me._id,
      });
      await Membership.insertMany([
        { groupId: created._id, userId: me._id, role: 'member', source: 'manual' },
        { groupId: created._id, userId: peer._id, role: 'member', source: 'manual' },
      ]);
      thread = created.toObject<GroupDoc>();
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      thread = await Group.findOne({ key }).lean<GroupDoc>();
    }
    if (!thread) throw notFound('Could not open the conversation.');
    joinUsersToGroup([String(me._id), String(peer._id)], String(thread._id));
  }

  const dto = await buildGroupDTO(me._id, thread._id);
  if (!dto) throw notFound('Could not open the conversation.');
  return dto;
}
