/**
 * Anonymous teacher evaluation.
 *
 * The Director's Office opens it near the end of term (students are told) and closes it (teachers
 * are told their results are ready). A student evaluates each course they are enrolled in once:
 * a receipt records only that they did (and the day), while the answers go into the course's
 * sheet with no student id, no time and at a random place in the list, so nothing links the two.
 * Results appear only after evaluation closes (otherwise a teacher could watch the count rise and
 * guess who just answered) and only with at least three answers; the course's teacher, the HOD of
 * its department, the Director's Office and IT may see them.
 */
import {
  campusClock,
  canManageCalendar,
  canStudyIn,
  canViewEvaluation,
  type EvaluationCourseDTO,
  type EvaluationHomeDTO,
  type EvaluationInput,
  type EvaluationReportDTO,
  type EvaluationRowDTO,
  type EvaluationWindowInput,
  evaluationSchema,
  evaluationWindowSchema,
  MIN_EVALUATION_RESPONSES,
  summarizeEvaluation,
} from '@cui/shared';
import {
  assertAllowed,
  badRequest,
  conflict,
  isDuplicateKeyError,
  notFound,
  parse,
} from '../lib/errors';
import {
  CampusSettings,
  CourseOffering,
  type CourseOfferingDoc,
  EvaluationReceipt,
  EvaluationSheet,
  type EvaluationSheetDoc,
  Term,
  type TermDoc,
  User,
  type UserDoc,
} from '../models';
import { recordAudit } from './audit';
import { getOrgLookup, type OrgLookup, sameId, toObjectId, toPolicyUser } from './mappers';
import { notify } from './notifications';
import { getCampusSettings, invalidateCampusSettings } from './settings';
import { currentTerm } from './terms';
import { offeringFacts } from './timetable';

const facts = (offering: CourseOfferingDoc, org: OrgLookup) =>
  offeringFacts(offering, org.sections.get(String(offering.sectionId)));

const canView = (viewer: UserDoc, offering: CourseOfferingDoc, org: OrgLookup) =>
  canViewEvaluation(toPolicyUser(viewer), facts(offering, org)).allowed;

async function teacherNames(offerings: CourseOfferingDoc[]): Promise<Map<string, string>> {
  const ids = offerings.flatMap((o) => (o.instructorId ? [o.instructorId] : []));
  const people = await User.find({ _id: { $in: ids } })
    .select('name')
    .lean<Pick<UserDoc, '_id' | 'name'>[]>();
  return new Map(people.map((p) => [String(p._id), p.name]));
}

const teacherRef = (offering: CourseOfferingDoc, names: Map<string, string>) =>
  offering.instructorId
    ? {
        id: String(offering.instructorId),
        name: names.get(String(offering.instructorId)) ?? 'Teacher',
      }
    : null;

/** Why a course's results can't be shown yet (null when they can). */
function hiddenReason(open: boolean, responses: number): string | null {
  if (open) {
    return 'Results appear when the evaluation closes, so no answer can be matched to a student while others are still answering.';
  }
  if (responses < MIN_EVALUATION_RESPONSES) {
    return `${responses === 0 ? 'Nobody' : `Only ${responses}`} answered. Results need at least ${MIN_EVALUATION_RESPONSES} answers so that nobody can be identified.`;
  }
  return null;
}

export async function evaluationHome(viewer: UserDoc): Promise<EvaluationHomeDTO> {
  const [term, settings, org] = await Promise.all([
    currentTerm(),
    getCampusSettings(),
    getOrgLookup(),
  ]);
  const termRef = { id: String(term._id), code: term.code, name: term.name };
  const canChangeWindow = canManageCalendar(toPolicyUser(viewer)).allowed;
  const open = settings.evaluationOpen;

  if (viewer.role === 'student') {
    const offerings = await CourseOffering.find({ termId: term._id, studentIds: viewer._id })
      .sort({ code: 1 })
      .lean<CourseOfferingDoc[]>();
    const [names, receipts] = await Promise.all([
      teacherNames(offerings),
      EvaluationReceipt.find({ studentId: viewer._id, termId: term._id }).distinct('offeringId'),
    ]);
    const done = new Set(receipts.map(String));
    const courses: EvaluationCourseDTO[] = offerings
      .filter((o) => o.instructorId)
      .map((o) => ({
        offeringId: String(o._id),
        code: o.code,
        title: o.title,
        sectionName: org.sections.get(String(o.sectionId))?.name ?? '',
        teacher: teacherRef(o, names),
        done: done.has(String(o._id)),
      }));
    return { term: termRef, open, canChangeWindow, courses, rows: [] };
  }

  const offerings = (
    await CourseOffering.find({ termId: term._id }).sort({ code: 1 }).lean<CourseOfferingDoc[]>()
  ).filter((o) => canView(viewer, o, org));
  const [names, sheets] = await Promise.all([
    teacherNames(offerings),
    EvaluationSheet.find({ _id: { $in: offerings.map((o) => o._id) } }).lean<
      EvaluationSheetDoc[]
    >(),
  ]);
  const sheetOf = new Map(sheets.map((s) => [String(s._id), s]));
  const rows: EvaluationRowDTO[] = offerings.map((o) => {
    const sheet = sheetOf.get(String(o._id));
    const responses = sheet?.responses.length ?? 0;
    const section = org.sections.get(String(o.sectionId));
    return {
      offeringId: String(o._id),
      code: o.code,
      title: o.title,
      sectionName: section?.name ?? '',
      departmentCode: section
        ? (org.departments.get(String(section.departmentId))?.code ?? null)
        : null,
      teacher: teacherRef(o, names),
      enrolled: o.studentIds.length,
      responses,
      overall:
        sheet && !hiddenReason(open, responses)
          ? summarizeEvaluation(sheet.responses).overall
          : null,
    };
  });
  return { term: termRef, open, canChangeWindow, courses: [], rows };
}

/** A student's answers for one course: once, while open, only for their own courses. */
export async function submitEvaluation(
  student: UserDoc,
  offeringId: string,
  input: EvaluationInput,
): Promise<{ ok: true }> {
  const data = parse(evaluationSchema, input);
  const [offering, org, term, settings] = await Promise.all([
    CourseOffering.findById(toObjectId(offeringId)).lean<CourseOfferingDoc>(),
    getOrgLookup(),
    currentTerm(),
    getCampusSettings(),
  ]);
  if (!offering) throw notFound('Course not found.');
  assertAllowed(canStudyIn(toPolicyUser(student), facts(offering, org)));
  if (!sameId(offering.termId, term._id))
    throw badRequest('Only this term’s courses are evaluated.');
  if (!offering.instructorId) throw badRequest('This course has no teacher to evaluate.');
  if (!settings.evaluationOpen) throw badRequest('Teacher evaluation is closed.');

  // The receipt first: its unique index means a second answer is refused.
  let receiptId: string;
  try {
    const receipt = await EvaluationReceipt.create({
      studentId: student._id,
      offeringId: offering._id,
      termId: term._id,
      day: campusClock().date,
    });
    receiptId = receipt._id;
  } catch (err) {
    if (isDuplicateKeyError(err)) throw conflict('You have already evaluated this course.');
    throw err;
  }
  try {
    const sheet = await EvaluationSheet.findOneAndUpdate(
      { _id: offering._id },
      {
        $setOnInsert: {
          termId: term._id,
          instructorId: offering.instructorId,
          departmentId: org.sections.get(String(offering.sectionId))?.departmentId ?? null,
        },
      },
      { upsert: true, returnDocument: 'after' },
    ).lean<EvaluationSheetDoc>();
    const position = Math.floor(Math.random() * ((sheet?.responses.length ?? 0) + 1));
    await EvaluationSheet.updateOne(
      { _id: offering._id },
      {
        $push: {
          responses: {
            $each: [
              {
                ratings: data.ratings,
                wentWell: data.wentWell || null,
                improve: data.improve || null,
              },
            ],
            $position: position,
          },
        },
      },
    );
  } catch (err) {
    // Without the answers, the receipt would wrongly say they answered.
    await EvaluationReceipt.deleteOne({ _id: receiptId });
    throw err;
  }
  return { ok: true };
}

export async function evaluationReport(
  viewer: UserDoc,
  offeringId: string,
): Promise<EvaluationReportDTO> {
  const [offering, org, settings] = await Promise.all([
    CourseOffering.findById(toObjectId(offeringId)).lean<CourseOfferingDoc>(),
    getOrgLookup(),
    getCampusSettings(),
  ]);
  if (!offering) throw notFound('Course not found.');
  assertAllowed(canViewEvaluation(toPolicyUser(viewer), facts(offering, org)));
  const [sheet, names, current, term] = await Promise.all([
    EvaluationSheet.findById(offering._id).lean<EvaluationSheetDoc>(),
    teacherNames([offering]),
    currentTerm(),
    Term.findById(offering.termId).select('code name').lean<Pick<TermDoc, 'code' | 'name'>>(),
  ]);
  const responses = sheet?.responses.length ?? 0;
  // Earlier terms' evaluations are closed whatever today's setting is.
  const open = settings.evaluationOpen && sameId(offering.termId, current._id);
  const reason = hiddenReason(open, responses);
  return {
    offeringId: String(offering._id),
    term: { id: String(offering.termId), code: term?.code ?? '', name: term?.name ?? '' },
    code: offering.code,
    title: offering.title,
    sectionName: org.sections.get(String(offering.sectionId))?.name ?? '',
    teacher: teacherRef(offering, names),
    enrolled: offering.studentIds.length,
    responses,
    hiddenReason: reason,
    summary: !reason && sheet ? summarizeEvaluation(sheet.responses) : null,
  };
}

/** The Director's Office (or IT) opens or closes evaluation for the current term. */
export async function setEvaluationWindow(
  actor: UserDoc,
  input: EvaluationWindowInput,
): Promise<{ open: boolean }> {
  assertAllowed(canManageCalendar(toPolicyUser(actor)));
  const { open } = parse(evaluationWindowSchema, input);
  const before = (await getCampusSettings()).evaluationOpen;
  await CampusSettings.updateOne(
    { _id: 'campus' },
    { $set: { evaluationOpen: open } },
    { upsert: true },
  );
  invalidateCampusSettings();
  if (before === open) return { open };

  const term = await currentTerm();
  void recordAudit({
    action: 'evaluation.window',
    actor,
    summary: `${actor.name} ${open ? 'opened' : 'closed'} teacher evaluation for ${term.name}`,
    targetType: 'settings',
  });
  const today = campusClock().date;
  if (open) {
    const students = await CourseOffering.find({ termId: term._id }).distinct('studentIds');
    await notify(students, {
      type: 'evaluation',
      title: `Teacher evaluation for ${term.name} is open`,
      body: 'Tell us about each of your courses. Your answers are anonymous.',
      link: '/academics/evaluation',
      key: `evaluation:open:${term.code}:${today}`,
    });
  } else {
    // Teachers whose courses have enough answers to show.
    const sheets = await EvaluationSheet.find({ termId: term._id })
      .select('instructorId responses')
      .lean<Pick<EvaluationSheetDoc, 'instructorId' | 'responses'>[]>();
    const teachers = sheets
      .filter((s) => s.instructorId && s.responses.length >= MIN_EVALUATION_RESPONSES)
      .flatMap((s) => (s.instructorId ? [s.instructorId] : []));
    await notify(teachers, {
      type: 'evaluation',
      title: 'Your course evaluation results are ready',
      body: `${term.name}: see what students said about your courses.`,
      link: '/academics/evaluation',
      key: `evaluation:closed:${term.code}:${today}`,
    });
  }
  return { open };
}
