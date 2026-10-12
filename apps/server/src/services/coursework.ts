/**
 * Coursework: assignments handed in online, and course materials by week.
 *
 * An assignment owns a column in the course's marks sheet (an Assessment of type "assignment"):
 * grading a submission writes that column, and returning the grades publishes it, so the marks,
 * the student's projected grade and the "marks are out" notifications all work as for any
 * assessment. Live quizzes are in quizzes.ts.
 */
import {
  type AssignmentDetailDTO,
  type AssignmentDTO,
  type AssignmentGradesInput,
  type AssignmentInput,
  type AssignmentState,
  type AssignmentSummaryDTO,
  assignmentGradesSchema,
  assignmentSchema,
  type CourseworkCourseDTO,
  type CourseworkOverviewDTO,
  campusClock,
  canStudyIn,
  canViewOfferingRecords,
  formatInstant,
  isLate,
  type MaterialDTO,
  type MaterialInput,
  materialSchema,
  type SubmissionDTO,
  type SubmissionInput,
  submissionSchema,
  submissionWindow,
} from '@cui/shared';
import { Types } from 'mongoose';
import { assertAllowed, badRequest, notFound, parse } from '../lib/errors';
import {
  Assessment,
  Assignment,
  type AssignmentDoc,
  CourseOffering,
  type CourseOfferingDoc,
  Mark,
  type MarkDoc,
  Material,
  type MaterialDoc,
  Submission,
  type SubmissionDoc,
  type UserDoc,
} from '../models';
import { recordAudit } from './audit';
import { claimFiles, deleteFiles, filesByIds, releaseFiles, toFileDTO } from './files';
import { getOrgLookup, sameId, toObjectId, toPolicyUser } from './mappers';
import { publishAssessment, saveMarks, updateAssessment } from './marks';
import { notify } from './notifications';
import {
  contextFor,
  courseLabel,
  courseRef,
  enrolledStudents,
  loadOffering,
  manageDecision,
  type OfferingContext,
  studentRef,
} from './offering-context';
import { quizSummaries } from './quizzes';
import { currentTerm } from './terms';
import { offeringFacts } from './timetable';

// ---- Who is looking ----

export interface CourseRole {
  canManage: boolean;
  isStudent: boolean;
  /** HOD, Exam Office: may look at everything, change nothing. */
  canViewRecords: boolean;
}

export function courseRole(user: UserDoc, ctx: OfferingContext): CourseRole {
  const facts = offeringFacts(ctx.offering, ctx.section);
  const policyUser = toPolicyUser(user);
  return {
    canManage: manageDecision(user, ctx).allowed,
    isStudent: canStudyIn(policyUser, facts).allowed,
    canViewRecords: canViewOfferingRecords(policyUser, facts).allowed,
  };
}

/** Members of the course (and those who oversee it) may look; everyone else is refused. */
function assertMember(user: UserDoc, ctx: OfferingContext): CourseRole {
  const role = courseRole(user, ctx);
  if (!role.canManage && !role.isStudent && !role.canViewRecords) {
    assertAllowed(canStudyIn(toPolicyUser(user), offeringFacts(ctx.offering, ctx.section)));
  }
  return role;
}

// ---- Mapping ----

async function toAssignmentDTO(
  a: AssignmentDoc,
  ctx: OfferingContext,
  returned: boolean,
): Promise<AssignmentDTO> {
  return {
    id: String(a._id),
    course: courseRef(ctx),
    title: a.title,
    instructions: a.instructions,
    dueAt: a.dueAt.toISOString(),
    lateUntil: a.lateUntil?.toISOString() ?? null,
    total: a.total,
    attachments: (await filesByIds(a.attachmentIds)).map(toFileDTO),
    assessmentId: String(a.assessmentId),
    returned,
    createdAt: a.createdAt.toISOString(),
  };
}

async function toSubmissionDTO(s: SubmissionDoc): Promise<SubmissionDTO> {
  return {
    files: (await filesByIds(s.fileIds)).map(toFileDTO),
    note: s.note,
    submittedAt: s.submittedAt.toISOString(),
    late: s.late,
  };
}

const windowOf = (a: Pick<AssignmentDoc, 'dueAt' | 'lateUntil'>, now = new Date()) =>
  submissionWindow(
    { dueAt: a.dueAt.toISOString(), lateUntil: a.lateUntil?.toISOString() ?? null },
    now,
  );

function stateOf(
  a: AssignmentDoc,
  submission: SubmissionDoc | undefined,
  returned: boolean,
  obtained: number | null,
): AssignmentState {
  if (submission) return returned ? 'graded' : submission.late ? 'late' : 'submitted';
  if (windowOf(a) !== 'closed') return 'todo';
  return returned && obtained !== null ? 'graded' : 'missing';
}

async function loadAssignment(assignmentId: string) {
  const assignment = await Assignment.findById(toObjectId(assignmentId)).lean<AssignmentDoc>();
  if (!assignment) throw notFound('Assignment not found.');
  const ctx = await loadOffering(String(assignment.offeringId));
  return { assignment, ctx };
}

const isReturned = async (a: AssignmentDoc) =>
  !!(await Assessment.exists({ _id: a.assessmentId, published: true }));

const dueLine = (a: { dueAt: Date; total: number }) =>
  `Due ${formatInstant(a.dueAt.toISOString())} · ${a.total} marks`;

// ---- Assignments: the teacher ----

export async function createAssignment(
  actor: UserDoc,
  offeringId: string,
  input: AssignmentInput,
): Promise<AssignmentDTO> {
  const ctx = await loadOffering(offeringId);
  assertAllowed(manageDecision(actor, ctx));
  const data = parse(assignmentSchema, input);
  if (Date.parse(data.dueAt) <= Date.now()) throw badRequest('Choose a due time in the future.');

  const id = new Types.ObjectId();
  const attachments = await claimFiles(actor, data.attachmentIds, {
    purpose: 'assignment',
    offeringId: ctx.offering._id,
    attachTo: id,
  });
  const dueAt = new Date(data.dueAt);
  const assessment = await Assessment.create({
    offeringId: ctx.offering._id,
    type: 'assignment',
    title: data.title,
    total: data.total,
    date: campusClock(dueAt).date,
    createdById: actor._id,
  });
  const assignment = (
    await Assignment.create({
      _id: id,
      offeringId: ctx.offering._id,
      title: data.title,
      instructions: data.instructions || null,
      dueAt,
      lateUntil: data.lateUntil ? new Date(data.lateUntil) : null,
      total: data.total,
      attachmentIds: attachments.map((f) => f._id),
      assessmentId: assessment._id,
      createdById: actor._id,
    })
  ).toObject<AssignmentDoc>();

  void recordAudit({
    action: 'assignment.created',
    actor,
    summary: `${actor.name} set ${data.title} for ${courseLabel(ctx)} (${dueLine(assignment)})`,
    targetType: 'course',
    targetId: ctx.offering._id,
  });
  await notify(ctx.offering.studentIds, {
    type: 'coursework',
    title: `New assignment in ${ctx.offering.title}: ${data.title}`,
    body: `${dueLine(assignment)}.`,
    link: `/academics/assignments/${id}`,
    key: `assignment:${id}:new`,
  });
  return toAssignmentDTO(assignment, ctx, false);
}

export async function updateAssignment(
  actor: UserDoc,
  assignmentId: string,
  input: AssignmentInput,
): Promise<AssignmentDTO> {
  const { assignment, ctx } = await loadAssignment(assignmentId);
  assertAllowed(manageDecision(actor, ctx));
  const data = parse(assignmentSchema, input);
  const dueAt = new Date(data.dueAt);
  // The marks column follows (it refuses a total below a mark already given).
  await updateAssessment(actor, String(assignment.assessmentId), {
    type: 'assignment',
    title: data.title,
    total: data.total,
    date: campusClock(dueAt).date,
  });
  const attachments = await claimFiles(actor, data.attachmentIds, {
    purpose: 'assignment',
    offeringId: ctx.offering._id,
    attachTo: assignment._id,
  });
  const keep = attachments.map((f) => f._id);
  await releaseFiles(assignment._id, keep);
  const updated = await Assignment.findByIdAndUpdate(
    assignment._id,
    {
      $set: {
        title: data.title,
        instructions: data.instructions || null,
        dueAt,
        lateUntil: data.lateUntil ? new Date(data.lateUntil) : null,
        total: data.total,
        attachmentIds: keep,
      },
    },
    { returnDocument: 'after' },
  ).lean<AssignmentDoc>();
  if (!updated) throw notFound('Assignment not found.');

  if (dueAt.getTime() !== assignment.dueAt.getTime()) {
    // Work handed in before the new due time is on time after all (and the other way round).
    await Submission.updateMany(
      { assignmentId: assignment._id, submittedAt: { $gt: dueAt } },
      { $set: { late: true } },
    );
    await Submission.updateMany(
      { assignmentId: assignment._id, submittedAt: { $lte: dueAt } },
      { $set: { late: false } },
    );
    await notify(ctx.offering.studentIds, {
      type: 'coursework',
      title: `New due date: ${ctx.offering.title} ${data.title}`,
      body: `${dueLine(updated)}.`,
      link: `/academics/assignments/${assignment._id}`,
      key: `assignment:${assignment._id}:due:${dueAt.toISOString()}`,
    });
  }
  return toAssignmentDTO(updated, ctx, await isReturned(updated));
}

/** Deletes the assignment with its submissions, files and marks column. */
export async function deleteAssignment(actor: UserDoc, assignmentId: string): Promise<void> {
  const { assignment, ctx } = await loadAssignment(assignmentId);
  assertAllowed(manageDecision(actor, ctx));
  const submissions = await Submission.find({ assignmentId: assignment._id }).lean<
    SubmissionDoc[]
  >();
  await deleteFiles([...assignment.attachmentIds, ...submissions.flatMap((s) => s.fileIds)]);
  await Promise.all([
    Submission.deleteMany({ assignmentId: assignment._id }),
    Mark.deleteMany({ assessmentId: assignment.assessmentId }),
    Assessment.deleteOne({ _id: assignment.assessmentId }),
    Assignment.deleteOne({ _id: assignment._id }),
  ]);
  void recordAudit({
    action: 'assignment.deleted',
    actor,
    summary: `${actor.name} removed ${assignment.title} from ${courseLabel(ctx)} (${submissions.length} submissions)`,
    targetType: 'course',
    targetId: ctx.offering._id,
  });
}

/** Marks go into the marks sheet; comments stay with the submission. */
export async function saveAssignmentGrades(
  actor: UserDoc,
  assignmentId: string,
  input: AssignmentGradesInput,
): Promise<{ saved: number }> {
  const { assignment, ctx } = await loadAssignment(assignmentId);
  assertAllowed(manageDecision(actor, ctx));
  const { grades } = parse(assignmentGradesSchema, input);
  const result = await saveMarks(actor, String(assignment.assessmentId), {
    marks: grades.map((g) => ({ studentId: g.studentId, obtained: g.obtained })),
  });
  const withFeedback = grades.filter((g) => g.feedback !== undefined);
  if (withFeedback.length) {
    await Submission.bulkWrite(
      withFeedback.map((g) => ({
        updateOne: {
          filter: { assignmentId: assignment._id, studentId: toObjectId(g.studentId) },
          update: { $set: { feedback: g.feedback || null } },
        },
      })),
    );
  }
  return result;
}

/** Returning grades publishes the marks column: each student is told their score. */
export async function returnAssignmentGrades(
  actor: UserDoc,
  assignmentId: string,
  returned: boolean,
): Promise<void> {
  const { assignment, ctx } = await loadAssignment(assignmentId);
  assertAllowed(manageDecision(actor, ctx));
  await publishAssessment(
    actor,
    String(assignment.assessmentId),
    returned,
    `/academics/assignments/${assignment._id}`,
  );
}

// ---- Assignments: the student ----

/** A student's mark and the teacher's comments, once grades are returned. */
async function gradeOf(
  assignment: AssignmentDoc,
  studentId: Types.ObjectId,
  submission: SubmissionDoc | null,
): Promise<AssignmentDetailDTO['grade']> {
  const mark = await Mark.findOne({
    assessmentId: assignment.assessmentId,
    studentId,
  }).lean<MarkDoc>();
  return { obtained: mark?.obtained ?? null, feedback: submission?.feedback ?? null };
}

export async function submitAssignment(
  student: UserDoc,
  assignmentId: string,
  input: SubmissionInput,
): Promise<SubmissionDTO> {
  const { assignment, ctx } = await loadAssignment(assignmentId);
  assertAllowed(canStudyIn(toPolicyUser(student), offeringFacts(ctx.offering, ctx.section)));
  const window = windowOf(assignment);
  if (window === 'closed') {
    throw badRequest(
      `Submissions closed on ${formatInstant((assignment.lateUntil ?? assignment.dueAt).toISOString())}.`,
    );
  }
  if (await isReturned(assignment)) {
    throw badRequest('Grades have been returned, so the submission can no longer change.');
  }
  const data = parse(submissionSchema, input);
  const existing = await Submission.findOne({
    assignmentId: assignment._id,
    studentId: student._id,
  }).lean<SubmissionDoc>();
  const submissionId = existing?._id ?? new Types.ObjectId();
  const files = await claimFiles(student, data.fileIds, {
    purpose: 'submission',
    offeringId: ctx.offering._id,
    attachTo: submissionId,
  });
  const keep = files.map((f) => f._id);
  await releaseFiles(submissionId, keep);
  const submittedAt = new Date();
  const saved = await Submission.findOneAndUpdate(
    { assignmentId: assignment._id, studentId: student._id },
    {
      $set: {
        offeringId: ctx.offering._id,
        fileIds: keep,
        note: data.note || null,
        submittedAt,
        late: isLate(assignment.dueAt.toISOString(), submittedAt.toISOString()),
      },
      $setOnInsert: { _id: submissionId, feedback: null },
    },
    { upsert: true, returnDocument: 'after' },
  ).lean<SubmissionDoc>();
  if (!saved) throw notFound('Assignment not found.');
  return toSubmissionDTO(saved);
}

/** Takes the work back while the assignment is still open. */
export async function withdrawSubmission(student: UserDoc, assignmentId: string): Promise<void> {
  const { assignment, ctx } = await loadAssignment(assignmentId);
  assertAllowed(canStudyIn(toPolicyUser(student), offeringFacts(ctx.offering, ctx.section)));
  if (windowOf(assignment) === 'closed') throw badRequest('Submissions for this are closed.');
  if (await isReturned(assignment)) throw badRequest('Grades have already been returned.');
  const submission = await Submission.findOneAndDelete({
    assignmentId: assignment._id,
    studentId: student._id,
  }).lean<SubmissionDoc>();
  if (submission) await deleteFiles(submission.fileIds);
}

// ---- Reading ----

export async function assignmentDetail(
  viewer: UserDoc,
  assignmentId: string,
): Promise<AssignmentDetailDTO> {
  const { assignment, ctx } = await loadAssignment(assignmentId);
  const role = assertMember(viewer, ctx);
  const returned = await isReturned(assignment);
  const dto = await toAssignmentDTO(assignment, ctx, returned);

  if (role.isStudent) {
    const own = await Submission.findOne({
      assignmentId: assignment._id,
      studentId: viewer._id,
    }).lean<SubmissionDoc>();
    return {
      assignment: dto,
      canManage: false,
      mine: own ? await toSubmissionDTO(own) : null,
      grade: returned ? await gradeOf(assignment, viewer._id, own) : null,
      submissions: null,
      stats: null,
    };
  }

  const [students, submissions, marks] = await Promise.all([
    enrolledStudents(ctx.offering),
    Submission.find({ assignmentId: assignment._id }).lean<SubmissionDoc[]>(),
    Mark.find({ assessmentId: assignment.assessmentId }).lean<MarkDoc[]>(),
  ]);
  const submissionOf = new Map(submissions.map((s) => [String(s.studentId), s]));
  const markOf = new Map(marks.map((m) => [String(m.studentId), m.obtained]));
  const rows = await Promise.all(
    students.map(async (student) => {
      const id = String(student._id);
      const submission = submissionOf.get(id);
      return {
        student: studentRef(student),
        submission: submission ? await toSubmissionDTO(submission) : null,
        obtained: markOf.get(id) ?? null,
        feedback: submission?.feedback ?? null,
      };
    }),
  );
  return {
    assignment: dto,
    canManage: role.canManage,
    mine: null,
    grade: null,
    submissions: rows,
    stats: {
      enrolled: students.length,
      submitted: rows.filter((r) => r.submission).length,
      late: rows.filter((r) => r.submission?.late).length,
      graded: rows.filter((r) => r.obtained !== null).length,
    },
  };
}

interface CourseworkData {
  assignments: AssignmentDoc[];
  published: Set<string>;
  submissions: SubmissionDoc[];
  marks: MarkDoc[];
}

async function loadCoursework(offeringIds: Types.ObjectId[]): Promise<CourseworkData> {
  const assignments = await Assignment.find({ offeringId: { $in: offeringIds } })
    .sort({ dueAt: 1 })
    .lean<AssignmentDoc[]>();
  const assessmentIds = assignments.map((a) => a.assessmentId);
  const [published, submissions, marks] = await Promise.all([
    Assessment.find({ _id: { $in: assessmentIds }, published: true }).distinct('_id'),
    Submission.find({ assignmentId: { $in: assignments.map((a) => a._id) } })
      .select('-note -feedback')
      .lean<SubmissionDoc[]>(),
    Mark.find({ assessmentId: { $in: assessmentIds }, obtained: { $ne: null } }).lean<MarkDoc[]>(),
  ]);
  return { assignments, published: new Set(published.map(String)), submissions, marks };
}

function summarize(
  a: AssignmentDoc,
  ctx: OfferingContext,
  data: CourseworkData,
  viewer: UserDoc,
  role: CourseRole,
): AssignmentSummaryDTO {
  const returned = data.published.has(String(a.assessmentId));
  const base = {
    id: String(a._id),
    course: courseRef(ctx),
    title: a.title,
    dueAt: a.dueAt.toISOString(),
    lateUntil: a.lateUntil?.toISOString() ?? null,
    total: a.total,
    returned,
  };
  if (role.isStudent) {
    const submission = data.submissions.find(
      (s) => sameId(s.assignmentId, a._id) && sameId(s.studentId, viewer._id),
    );
    const mark = data.marks.find(
      (m) => sameId(m.assessmentId, a.assessmentId) && sameId(m.studentId, viewer._id),
    );
    const obtained = returned ? (mark?.obtained ?? null) : null;
    return {
      ...base,
      state: stateOf(a, submission, returned, obtained),
      obtained,
      submitted: null,
      enrolled: null,
    };
  }
  return {
    ...base,
    state: null,
    obtained: null,
    submitted: data.submissions.filter((s) => sameId(s.assignmentId, a._id)).length,
    enrolled: ctx.offering.studentIds.length,
  };
}

const toMaterialDTO = async (m: MaterialDoc): Promise<MaterialDTO> => ({
  id: String(m._id),
  week: m.week,
  title: m.title,
  description: m.description,
  file: m.fileId ? ((await filesByIds([m.fileId])).map(toFileDTO)[0] ?? null) : null,
  url: m.url,
  createdAt: m.createdAt.toISOString(),
});

/** Teachers: submissions without a mark, in assignments whose grades are not returned yet. */
function ungraded(data: CourseworkData, offeringId: Types.ObjectId): number {
  const assessmentOf = new Map(
    data.assignments.map((a) => [String(a._id), String(a.assessmentId)]),
  );
  const marked = new Set(data.marks.map((m) => `${m.assessmentId}:${m.studentId}`));
  return data.submissions.filter((s) => {
    const assessmentId = assessmentOf.get(String(s.assignmentId));
    return (
      sameId(s.offeringId, offeringId) &&
      !!assessmentId &&
      !data.published.has(assessmentId) &&
      !marked.has(`${assessmentId}:${s.studentId}`)
    );
  }).length;
}

/** Everything for one course: assignments, materials by week and quizzes. */
export async function courseCoursework(
  viewer: UserDoc,
  offeringId: string,
): Promise<CourseworkCourseDTO> {
  const ctx = await loadOffering(offeringId);
  const role = assertMember(viewer, ctx);
  const [data, materials, quizzes] = await Promise.all([
    loadCoursework([ctx.offering._id]),
    Material.find({ offeringId: ctx.offering._id })
      .sort({ week: 1, createdAt: 1 })
      .lean<MaterialDoc[]>(),
    quizSummaries(viewer, [ctx.offering], role.isStudent),
  ]);
  return {
    course: courseRef(ctx),
    canManage: role.canManage,
    assignments: data.assignments.map((a) => summarize(a, ctx, data, viewer, role)),
    materials: await Promise.all(materials.map(toMaterialDTO)),
    quizzes,
  };
}

/** The viewer's courses this term, what's due, and any quiz running now. */
export async function courseworkOverview(viewer: UserDoc): Promise<CourseworkOverviewDTO> {
  if (viewer.role !== 'student' && viewer.role !== 'faculty') {
    return { courses: [], upcoming: [], live: [] };
  }
  const term = await currentTerm();
  const [offerings, org] = await Promise.all([
    CourseOffering.find({
      termId: term._id,
      ...(viewer.role === 'student' ? { studentIds: viewer._id } : { instructorId: viewer._id }),
    })
      .sort({ code: 1 })
      .lean<CourseOfferingDoc[]>(),
    getOrgLookup(),
  ]);
  const ids = offerings.map((o) => o._id);
  const [data, materialCounts, quizzes] = await Promise.all([
    loadCoursework(ids),
    Material.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { offeringId: { $in: ids } } },
      { $group: { _id: '$offeringId', n: { $sum: 1 } } },
    ]),
    quizSummaries(viewer, offerings, viewer.role === 'student'),
  ]);
  const now = new Date();
  const courses: CourseworkOverviewDTO['courses'] = [];
  const upcoming: AssignmentSummaryDTO[] = [];
  for (const offering of offerings) {
    const ctx = contextFor(offering, org);
    const role = courseRole(viewer, ctx);
    const summaries = data.assignments
      .filter((a) => sameId(a.offeringId, offering._id))
      .map((a) => summarize(a, ctx, data, viewer, role));
    const pending = role.isStudent
      ? summaries.filter((s) => s.state === 'todo').length
      : ungraded(data, offering._id);
    courses.push({
      course: courseRef(ctx),
      canManage: role.canManage,
      assignments: summaries.length,
      pending,
      materials: materialCounts.find((m) => sameId(m._id, offering._id))?.n ?? 0,
    });
    upcoming.push(
      ...summaries.filter((s) =>
        role.isStudent ? s.state === 'todo' : Date.parse(s.dueAt) >= now.getTime(),
      ),
    );
  }
  upcoming.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return { courses, upcoming, live: quizzes.filter((q) => q.status === 'live') };
}

// ---- Materials ----

export async function addMaterial(
  actor: UserDoc,
  offeringId: string,
  input: MaterialInput,
): Promise<MaterialDTO> {
  const ctx = await loadOffering(offeringId);
  assertAllowed(manageDecision(actor, ctx));
  const data = parse(materialSchema, input);
  const id = new Types.ObjectId();
  const [file] = data.fileId
    ? await claimFiles(actor, [data.fileId], {
        purpose: 'material',
        offeringId: ctx.offering._id,
        attachTo: id,
      })
    : [];
  const material = (
    await Material.create({
      _id: id,
      offeringId: ctx.offering._id,
      week: data.week,
      title: data.title,
      description: data.description || null,
      fileId: file?._id ?? null,
      url: data.url ?? null,
      createdById: actor._id,
    })
  ).toObject<MaterialDoc>();
  // At most one "new material" alert per course per day.
  await notify(ctx.offering.studentIds, {
    type: 'coursework',
    title: `New material in ${ctx.offering.title}`,
    body: `Week ${data.week}: ${data.title}`,
    link: `/academics/coursework/${ctx.offering._id}?tab=materials`,
    key: `materials:${ctx.offering._id}:${campusClock().date}`,
  });
  return toMaterialDTO(material);
}

export async function deleteMaterial(actor: UserDoc, materialId: string): Promise<void> {
  const material = await Material.findById(toObjectId(materialId)).lean<MaterialDoc>();
  if (!material) throw notFound('Material not found.');
  const ctx = await loadOffering(String(material.offeringId));
  assertAllowed(manageDecision(actor, ctx));
  if (material.fileId) await deleteFiles([material.fileId]);
  await Material.deleteOne({ _id: material._id });
}
