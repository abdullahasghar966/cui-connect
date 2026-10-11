/**
 * Marks and results. A teacher adds assessments (quizzes, sessionals…), enters marks and
 * publishes each assessment when it's ready: only then do students see it, and each is told
 * their own score. Grades follow the course's weights (or the campus default). Finalising a
 * course writes each student's final grade to their record, which the CGPA is built from.
 */
import {
  ASSESSMENT_LABELS,
  type AssessmentDTO,
  type AssessmentInput,
  assessmentSchema,
  type CourseGradingInput,
  type CourseStanding,
  cgpa,
  courseGradingSchema,
  courseStanding,
  creditsEarned,
  DEFAULT_GRADING,
  type GradeDTO,
  type GradingWeights,
  gpa,
  gradeFor,
  type MarksInput,
  type MarksSheetDTO,
  type MyResultsDTO,
  marksSchema,
  round,
  type StudentCourseResultDTO,
  type TermResultDTO,
  termIndex,
} from '@cui/shared';
import type { Types } from 'mongoose';
import { assertAllowed, badRequest, notFound, parse } from '../lib/errors';
import {
  Assessment,
  type AssessmentDoc,
  CatalogCourse,
  CourseOffering,
  type CourseOfferingDoc,
  Mark,
  type MarkDoc,
  Result,
  type ResultDoc,
  Term,
  type TermDoc,
  type UserDoc,
} from '../models';
import { recordAudit } from './audit';
import { getOrgLookup, sameId, toObjectId } from './mappers';
import { notify } from './notifications';
import {
  assertCanView,
  contextFor,
  courseLabel,
  courseRef,
  enrolledStudents,
  loadOffering,
  manageDecision,
  type OfferingContext,
  studentRef,
} from './offering-context';
import { currentTerm } from './terms';

// ---- Helpers ----

export const weightsOf = (offering: CourseOfferingDoc): GradingWeights =>
  offering.grading ?? DEFAULT_GRADING;

export function toGrade(percent: number): GradeDTO {
  const band = gradeFor(percent);
  return { percent: round(percent, 1), grade: band.grade, points: band.points };
}

const projectedOf = (standing: CourseStanding): GradeDTO | null =>
  standing.projectedPercent === null ? null : toGrade(standing.projectedPercent);

async function creditsOf(code: string): Promise<number> {
  const course = await CatalogCourse.findOne({ code }).select('credits').lean();
  return course?.credits ?? 3;
}

const markKey = (assessmentId: unknown, studentId: unknown) => `${assessmentId}:${studentId}`;

function statsOf(
  assessment: AssessmentDoc,
  marks: Map<string, number | null>,
  studentIds: string[],
): AssessmentDTO['stats'] {
  const values = studentIds
    .map((id) => marks.get(markKey(assessment._id, id)))
    .filter((v): v is number => typeof v === 'number');
  return {
    marked: values.length,
    average: values.length ? round(values.reduce((a, b) => a + b, 0) / values.length, 2) : null,
    highest: values.length ? Math.max(...values) : null,
    lowest: values.length ? Math.min(...values) : null,
  };
}

function toAssessmentDTO(
  assessment: AssessmentDoc,
  marks: Map<string, number | null>,
  studentIds: string[],
): AssessmentDTO {
  return {
    id: String(assessment._id),
    type: assessment.type,
    title: assessment.title,
    total: assessment.total,
    date: assessment.date,
    published: assessment.published,
    publishedAt: assessment.publishedAt?.toISOString() ?? null,
    stats: statsOf(assessment, marks, studentIds),
  };
}

async function loadMarks(offeringId: Types.ObjectId) {
  const [assessments, marks] = await Promise.all([
    Assessment.find({ offeringId }).sort({ date: 1, createdAt: 1 }).lean<AssessmentDoc[]>(),
    Mark.find({ offeringId }).lean<MarkDoc[]>(),
  ]);
  const byKey = new Map(marks.map((m) => [markKey(m.assessmentId, m.studentId), m.obtained]));
  return { assessments, byKey };
}

function standingFor(
  assessments: AssessmentDoc[],
  marks: Map<string, number | null>,
  studentId: string,
  weights: GradingWeights,
): CourseStanding {
  return courseStanding(
    assessments.map((a) => ({
      type: a.type,
      total: a.total,
      obtained: marks.get(markKey(a._id, studentId)) ?? null,
    })),
    weights,
  );
}

async function loadAssessment(assessmentId: string) {
  const assessment = await Assessment.findById(toObjectId(assessmentId)).lean<AssessmentDoc>();
  if (!assessment) throw notFound('Assessment not found.');
  const ctx = await loadOffering(String(assessment.offeringId));
  return { assessment, ctx };
}

const describeScore = (obtained: number | null, total: number) =>
  obtained === null ? 'Your mark has not been entered yet.' : `You scored ${obtained}/${total}.`;

// ---- Teacher ----

export async function marksSheet(viewer: UserDoc, offeringId: string): Promise<MarksSheetDTO> {
  const ctx = await loadOffering(offeringId);
  const { canManage } = assertCanView(viewer, ctx);
  const [{ assessments, byKey }, students, credits, finals] = await Promise.all([
    loadMarks(ctx.offering._id),
    enrolledStudents(ctx.offering),
    creditsOf(ctx.offering.code),
    Result.find({ offeringId: ctx.offering._id }).lean<ResultDoc[]>(),
  ]);
  const ids = students.map((s) => String(s._id));
  const weights = weightsOf(ctx.offering);
  const finalBy = new Map(finals.map((r) => [String(r.studentId), r]));
  return {
    course: courseRef(ctx),
    credits,
    grading: weights,
    customGrading: !!ctx.offering.grading,
    assessments: assessments.map((a) => toAssessmentDTO(a, byKey, ids)),
    students: students.map((student) => {
      const id = String(student._id);
      const standing = standingFor(assessments, byKey, id, weights);
      const final = finalBy.get(id);
      return {
        student: studentRef(student),
        marks: assessments.map((a) => byKey.get(markKey(a._id, id)) ?? null),
        standing,
        projected: projectedOf(standing),
        final: final ? { percent: final.percent, grade: final.grade, points: final.points } : null,
      };
    }),
    finalizedAt: ctx.offering.finalizedAt?.toISOString() ?? null,
    canManage,
  };
}

export async function createAssessment(
  actor: UserDoc,
  offeringId: string,
  input: AssessmentInput,
): Promise<AssessmentDTO> {
  const ctx = await loadOffering(offeringId);
  assertAllowed(manageDecision(actor, ctx));
  const data = parse(assessmentSchema, input);
  const created = (
    await Assessment.create({
      offeringId: ctx.offering._id,
      type: data.type,
      title: data.title,
      total: data.total,
      date: data.date ?? null,
      createdById: actor._id,
    })
  ).toObject<AssessmentDoc>();
  void recordAudit({
    action: 'assessment.created',
    actor,
    summary: `${actor.name} added ${data.title} (${data.total} marks) to ${courseLabel(ctx)}`,
    targetType: 'course',
    targetId: ctx.offering._id,
  });
  return toAssessmentDTO(created, new Map(), []);
}

export async function updateAssessment(
  actor: UserDoc,
  assessmentId: string,
  input: AssessmentInput,
): Promise<void> {
  const { assessment, ctx } = await loadAssessment(assessmentId);
  assertAllowed(manageDecision(actor, ctx));
  const data = parse(assessmentSchema, input);
  const highest = await Mark.findOne({ assessmentId: assessment._id, obtained: { $ne: null } })
    .sort({ obtained: -1 })
    .lean<MarkDoc>();
  if (highest?.obtained && highest.obtained > data.total) {
    throw badRequest(
      `Someone already has ${highest.obtained} marks. The total can't be lower than that.`,
    );
  }
  await Assessment.updateOne(
    { _id: assessment._id },
    { $set: { type: data.type, title: data.title, total: data.total, date: data.date ?? null } },
  );
}

export async function deleteAssessment(actor: UserDoc, assessmentId: string): Promise<void> {
  const { assessment, ctx } = await loadAssessment(assessmentId);
  assertAllowed(manageDecision(actor, ctx));
  await Promise.all([
    Assessment.deleteOne({ _id: assessment._id }),
    Mark.deleteMany({ assessmentId: assessment._id }),
  ]);
  void recordAudit({
    action: 'assessment.deleted',
    actor,
    summary: `${actor.name} removed ${assessment.title} from ${courseLabel(ctx)}`,
    targetType: 'course',
    targetId: ctx.offering._id,
  });
}

/** Saves marks for one assessment. After publishing, students whose mark changes are told. */
export async function saveMarks(
  actor: UserDoc,
  assessmentId: string,
  input: MarksInput,
): Promise<{ saved: number }> {
  const { assessment, ctx } = await loadAssessment(assessmentId);
  assertAllowed(manageDecision(actor, ctx));
  const { marks } = parse(marksSchema, input);
  const enrolled = new Set(ctx.offering.studentIds.map(String));
  for (const m of marks) {
    if (!enrolled.has(m.studentId)) throw badRequest('A student in the list is not enrolled.');
    if (m.obtained !== null && m.obtained > assessment.total) {
      throw badRequest(`Marks can't be more than the total of ${assessment.total}.`);
    }
  }
  const before = new Map(
    (await Mark.find({ assessmentId: assessment._id }).lean<MarkDoc[]>()).map((m) => [
      String(m.studentId),
      m.obtained,
    ]),
  );
  const changed = marks.filter((m) => (before.get(m.studentId) ?? null) !== m.obtained);
  if (changed.length) {
    await Mark.bulkWrite(
      changed.map((m) => ({
        updateOne: {
          filter: { assessmentId: assessment._id, studentId: toObjectId(m.studentId) },
          update: {
            $set: {
              offeringId: ctx.offering._id,
              obtained: m.obtained,
              updatedById: actor._id,
            },
          },
          upsert: true,
        },
      })),
    );
  }
  if (assessment.published) {
    for (const m of changed) {
      await notify([m.studentId], {
        type: 'results',
        title: `Mark updated: ${ctx.offering.title} ${assessment.title}`,
        body: describeScore(m.obtained, assessment.total),
        link: '/academics/results',
      });
    }
  }
  return { saved: changed.length };
}

export async function publishAssessment(
  actor: UserDoc,
  assessmentId: string,
  publish: boolean,
): Promise<void> {
  const { assessment, ctx } = await loadAssessment(assessmentId);
  assertAllowed(manageDecision(actor, ctx));
  if (assessment.published === publish) return;
  await Assessment.updateOne(
    { _id: assessment._id },
    { $set: { published: publish, publishedAt: publish ? new Date() : null } },
  );
  void recordAudit({
    action: publish ? 'assessment.published' : 'assessment.unpublished',
    actor,
    summary: `${actor.name} ${publish ? 'published' : 'hid'} ${assessment.title} marks for ${courseLabel(ctx)}`,
    targetType: 'course',
    targetId: ctx.offering._id,
  });
  if (!publish) return;

  const marks = new Map(
    (await Mark.find({ assessmentId: assessment._id }).lean<MarkDoc[]>()).map((m) => [
      String(m.studentId),
      m.obtained,
    ]),
  );
  const values = [...marks.values()].filter((v): v is number => typeof v === 'number');
  const average = values.length
    ? ` Class average: ${round(values.reduce((a, b) => a + b, 0) / values.length, 1)}.`
    : '';
  // Each student hears their own score; publishing again later doesn't repeat it.
  for (const studentId of ctx.offering.studentIds.map(String)) {
    await notify([studentId], {
      type: 'results',
      title: `${ctx.offering.title} ${assessment.title} marks are out`,
      body: `${describeScore(marks.get(studentId) ?? null, assessment.total)}${average}`,
      link: '/academics/results',
      key: `results:${assessment._id}`,
    });
  }
}

export async function setGrading(
  actor: UserDoc,
  offeringId: string,
  input: CourseGradingInput,
): Promise<GradingWeights> {
  const ctx = await loadOffering(offeringId);
  assertAllowed(manageDecision(actor, ctx));
  const { weights } = parse(courseGradingSchema, input);
  await CourseOffering.updateOne({ _id: ctx.offering._id }, { $set: { grading: weights } });
  void recordAudit({
    action: 'grading.updated',
    actor,
    summary: `${actor.name} ${weights ? 'set custom grading weights' : 'went back to the default grading'} for ${courseLabel(ctx)}`,
    targetType: 'course',
    targetId: ctx.offering._id,
  });
  return weights ?? DEFAULT_GRADING;
}

/**
 * Writes every student's final grade from the published marks. Every weighted component needs a
 * published assessment and every student a mark in each (enter 0 for an absence).
 */
export async function finalizeCourse(
  actor: UserDoc,
  offeringId: string,
): Promise<{ finalized: number }> {
  const ctx = await loadOffering(offeringId);
  assertAllowed(manageDecision(actor, ctx));
  const term = await currentTerm();
  if (!sameId(ctx.offering.termId, term._id)) {
    throw badRequest('Only courses of the current term can be finalised.');
  }
  const weights = weightsOf(ctx.offering);
  const { assessments, byKey } = await loadMarks(ctx.offering._id);
  const published = assessments.filter((a) => a.published);
  const missing = (Object.keys(weights) as (keyof GradingWeights)[]).filter(
    (type) => weights[type] > 0 && !published.some((a) => a.type === type),
  );
  if (missing.length) {
    throw badRequest(
      `Publish marks for ${missing.map((t) => ASSESSMENT_LABELS[t]).join(', ')} before finalising.`,
    );
  }
  const students = await enrolledStudents(ctx.offering);
  const standings = students.map((s) => ({
    student: s,
    standing: standingFor(published, byKey, String(s._id), weights),
  }));
  const incomplete = standings.filter((s) => s.standing.finalPercent === null);
  if (incomplete.length) {
    throw badRequest(
      `${incomplete.length} student${incomplete.length === 1 ? ' has' : 's have'} no mark in a part of the course (${incomplete
        .slice(0, 3)
        .map((s) => s.student.name)
        .join(', ')}${incomplete.length > 3 ? '…' : ''}). Enter 0 for an absence.`,
    );
  }

  const credits = await creditsOf(ctx.offering.code);
  const grades = standings.map(({ student, standing }) => ({
    student,
    grade: toGrade(standing.finalPercent ?? 0),
  }));
  await Result.bulkWrite(
    grades.map(({ student, grade }) => ({
      updateOne: {
        filter: { studentId: student._id, termId: term._id, code: ctx.offering.code },
        update: {
          $set: {
            offeringId: ctx.offering._id,
            title: ctx.offering.title,
            credits,
            percent: grade.percent,
            grade: grade.grade,
            points: grade.points,
          },
        },
        upsert: true,
      },
    })),
  );
  await CourseOffering.updateOne({ _id: ctx.offering._id }, { $set: { finalizedAt: new Date() } });

  const cgpas = await cgpaFor(grades.map((g) => g.student._id));
  for (const { student, grade } of grades) {
    const now = cgpas.get(String(student._id));
    await notify([student._id], {
      type: 'results',
      title: `Final grade for ${ctx.offering.title}: ${grade.grade}`,
      body: `${grade.percent}% · ${grade.points.toFixed(2)} grade points.${now !== undefined && now !== null ? ` Your CGPA is now ${now.toFixed(2)}.` : ''}`,
      link: '/academics/results',
      key: `final:${ctx.offering._id}:${grade.grade}`,
    });
  }
  void recordAudit({
    action: 'grades.finalized',
    actor,
    summary: `${actor.name} finalised grades for ${courseLabel(ctx)} (${grades.length} students)`,
    targetType: 'course',
    targetId: ctx.offering._id,
  });
  return { finalized: grades.length };
}

// ---- Students ----

async function attemptsFor(studentIds: Types.ObjectId[]) {
  const [results, terms] = await Promise.all([
    Result.find({ studentId: { $in: studentIds } }).lean<ResultDoc[]>(),
    Term.find().lean<TermDoc[]>(),
  ]);
  const termById = new Map(terms.map((t) => [String(t._id), t]));
  return results.map((r) => ({
    ...r,
    term: termById.get(String(r.termId))?.code ?? 'FA00',
    termName: termById.get(String(r.termId))?.name ?? '',
  }));
}

async function cgpaFor(studentIds: Types.ObjectId[]): Promise<Map<string, number | null>> {
  const attempts = await attemptsFor(studentIds);
  const by = new Map<string, typeof attempts>();
  for (const a of attempts)
    by.set(String(a.studentId), [...(by.get(String(a.studentId)) ?? []), a]);
  return new Map([...by.entries()].map(([id, list]) => [id, cgpa(list)]));
}

export async function myResults(user: UserDoc): Promise<MyResultsDTO> {
  const term = await currentTerm();
  if (user.role !== 'student') {
    return {
      term: { code: term.code, name: term.name },
      courses: [],
      projectedGpa: null,
      cgpa: null,
      creditsEarned: 0,
      history: [],
    };
  }
  const [offerings, org, attempts] = await Promise.all([
    CourseOffering.find({ termId: term._id, studentIds: user._id })
      .sort({ code: 1 })
      .lean<CourseOfferingDoc[]>(),
    getOrgLookup(),
    attemptsFor([user._id]),
  ]);
  const ids = offerings.map((o) => o._id);
  const [assessments, marks, catalog] = await Promise.all([
    Assessment.find({ offeringId: { $in: ids }, published: true })
      .sort({ date: 1, createdAt: 1 })
      .lean<AssessmentDoc[]>(),
    Mark.find({ offeringId: { $in: ids } }).lean<MarkDoc[]>(),
    CatalogCourse.find({ code: { $in: offerings.map((o) => o.code) } })
      .select('code credits')
      .lean(),
  ]);
  const creditsBy = new Map(catalog.map((c) => [c.code, c.credits]));
  const byKey = new Map(marks.map((m) => [markKey(m.assessmentId, m.studentId), m.obtained]));
  const me = String(user._id);

  const courses: StudentCourseResultDTO[] = offerings.map((offering) => {
    const ctx: OfferingContext = contextFor(offering, org);
    const own = assessments.filter((a) => sameId(a.offeringId, offering._id));
    const weights = weightsOf(offering);
    const standing = standingFor(own, byKey, me, weights);
    const final = attempts.find((a) => a.term === term.code && a.code === offering.code);
    const studentIds = offering.studentIds.map(String);
    return {
      course: courseRef(ctx),
      credits: creditsBy.get(offering.code) ?? 3,
      grading: weights,
      assessments: own.map((a) => ({
        id: String(a._id),
        type: a.type,
        title: a.title,
        total: a.total,
        date: a.date,
        obtained: byKey.get(markKey(a._id, me)) ?? null,
        classAverage: statsOf(a, byKey, studentIds).average,
      })),
      standing,
      projected: projectedOf(standing),
      final: final ? { percent: final.percent, grade: final.grade, points: final.points } : null,
    };
  });

  const projected = courses
    .map((c) => ({ credits: c.credits, points: (c.final ?? c.projected)?.points }))
    .filter((c): c is { credits: number; points: number } => c.points !== undefined);

  const byTerm = new Map<string, typeof attempts>();
  for (const a of attempts) byTerm.set(a.term, [...(byTerm.get(a.term) ?? []), a]);
  const history: TermResultDTO[] = [...byTerm.entries()]
    .sort(([a], [b]) => termIndex(b) - termIndex(a))
    .map(([code, list]) => ({
      term: { code, name: list[0]?.termName ?? code },
      gpa: gpa(list),
      credits: list.reduce((sum, r) => sum + r.credits, 0),
      courses: list
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((r) => ({
          code: r.code,
          title: r.title,
          credits: r.credits,
          grade: r.grade,
          points: r.points,
        })),
    }));

  return {
    term: { code: term.code, name: term.name },
    courses,
    projectedGpa: gpa(projected),
    cgpa: cgpa(attempts),
    creditsEarned: creditsEarned(attempts),
    history,
  };
}
