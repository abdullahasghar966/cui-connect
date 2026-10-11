/**
 * Student records: the transcript and degree progress. A student sees their own; their teachers,
 * batch advisor, HOD, the Examination Office and IT see theirs (canViewStudentRecord), exactly
 * like marks and attendance.
 */
import {
  canViewStudentRecord,
  cgpa,
  creditsEarned,
  type DegreeProgressDTO,
  gpa,
  type PlanCourseStatus,
  type StudentRecordRefDTO,
  semesterNumber,
  type TermResultDTO,
  type TranscriptDTO,
  termIndex,
} from '@cui/shared';
import { assertAllowed, notFound } from '../lib/errors';
import { containsText } from '../lib/text';
import {
  CatalogCourse,
  CourseOffering,
  Program,
  type ProgramDoc,
  Section,
  type SectionDoc,
  User,
  type UserDoc,
} from '../models';
import { getOrgLookup, idOf, type OrgLookup, toObjectId, toPolicyUser } from './mappers';
import { attemptsFor } from './marks';
import { currentTerm } from './terms';

async function relation(viewer: UserDoc, student: UserDoc) {
  if (viewer.role !== 'faculty') return {};
  const [teaches, advises] = await Promise.all([
    CourseOffering.exists({ instructorId: viewer._id, studentIds: student._id }),
    student.sectionId
      ? Section.exists({ _id: student.sectionId, batchAdvisorId: viewer._id })
      : Promise.resolve(null),
  ]);
  return { teachesStudent: !!teaches, advisesStudent: !!advises };
}

/** The student whose record is asked for (default: the viewer), after the access check. */
async function resolveStudent(viewer: UserDoc, studentId?: string): Promise<UserDoc> {
  const student = studentId
    ? await User.findOne({ _id: toObjectId(studentId), role: 'student' }).lean<UserDoc>()
    : viewer;
  if (student?.role !== 'student')
    throw notFound(studentId ? 'Student not found.' : 'Choose a student.');
  assertAllowed(
    canViewStudentRecord(
      toPolicyUser(viewer),
      {
        id: String(student._id),
        departmentId: idOf(student.departmentId),
        sectionId: idOf(student.sectionId),
      },
      await relation(viewer, student),
    ),
  );
  return student;
}

function studentRef(student: UserDoc, org: OrgLookup): StudentRecordRefDTO {
  const section = student.sectionId ? org.sections.get(String(student.sectionId)) : undefined;
  return {
    id: String(student._id),
    name: student.name,
    regNo: student.regNo,
    sectionName: section?.name ?? null,
    programCode: section?.program ?? null,
  };
}

async function programOf(section: SectionDoc | undefined): Promise<ProgramDoc | null> {
  return section ? Program.findOne({ code: section.program }).lean<ProgramDoc>() : null;
}

const intakeOf = (student: UserDoc, section: SectionDoc | undefined) =>
  section?.intake ?? student.regNo?.slice(0, 4) ?? null;

export async function transcript(viewer: UserDoc, studentId?: string): Promise<TranscriptDTO> {
  const student = await resolveStudent(viewer, studentId);
  const org = await getOrgLookup();
  const section = student.sectionId ? org.sections.get(String(student.sectionId)) : undefined;
  const [attempts, program] = await Promise.all([attemptsFor([student._id]), programOf(section)]);
  const byTerm = new Map<string, typeof attempts>();
  for (const a of attempts) byTerm.set(a.term, [...(byTerm.get(a.term) ?? []), a]);
  const terms: TermResultDTO[] = [...byTerm.entries()]
    .sort(([a], [b]) => termIndex(a) - termIndex(b))
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
    student: {
      ...studentRef(student, org),
      programName: program?.name ?? null,
      departmentName: student.departmentId
        ? (org.departments.get(String(student.departmentId))?.name ?? null)
        : null,
      intake: intakeOf(student, section),
    },
    terms,
    cgpa: cgpa(attempts),
    creditsEarned: creditsEarned(attempts),
    creditsRequired: program?.totalCredits ?? null,
    generatedAt: new Date().toISOString(),
  };
}

export async function degreeProgress(
  viewer: UserDoc,
  studentId?: string,
): Promise<DegreeProgressDTO> {
  const student = await resolveStudent(viewer, studentId);
  const org = await getOrgLookup();
  const section = student.sectionId ? org.sections.get(String(student.sectionId)) : undefined;
  const term = await currentTerm();
  const [attempts, program, current] = await Promise.all([
    attemptsFor([student._id]),
    programOf(section),
    CourseOffering.find({ termId: term._id, studentIds: student._id }).select('code').lean(),
  ]);
  const inProgress = new Set(current.map((o) => o.code));
  // The latest attempt decides a course's status (a retake replaces an earlier F).
  const latest = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) {
    const seen = latest.get(a.code);
    if (!seen || termIndex(a.term) >= termIndex(seen.term)) latest.set(a.code, a);
  }
  const planned = new Set(program?.plan.flatMap((p) => p.courses) ?? []);
  const catalog = await CatalogCourse.find({
    code: { $in: [...planned, ...latest.keys()] },
  })
    .select('code title credits')
    .lean();
  const course = new Map(catalog.map((c) => [c.code, c]));

  const statusOf = (
    code: string,
  ): { status: PlanCourseStatus; grade: string | null; term: string | null } => {
    const result = latest.get(code);
    if (inProgress.has(code) && !(result && result.term === term.code)) {
      return { status: 'current', grade: null, term: term.code };
    }
    if (result) {
      return {
        status: result.points > 0 ? 'passed' : 'failed',
        grade: result.grade,
        term: result.term,
      };
    }
    return { status: 'planned', grade: null, term: null };
  };

  const semesters = [...(program?.plan ?? [])]
    .sort((a, b) => a.semester - b.semester)
    .map((step) => ({
      semester: step.semester,
      courses: step.courses.map((code) => ({
        code,
        title: course.get(code)?.title ?? code,
        credits: course.get(code)?.credits ?? 3,
        ...statusOf(code),
      })),
    }));
  const intake = intakeOf(student, section);
  return {
    student: studentRef(student, org),
    program: program
      ? { code: program.code, name: program.name, totalCredits: program.totalCredits }
      : null,
    semesters,
    outsidePlan: [...latest.values()]
      .filter((r) => !planned.has(r.code) && r.points > 0)
      .map((r) => ({ code: r.code, title: r.title, credits: r.credits, grade: r.grade })),
    creditsEarned: creditsEarned(attempts),
    creditsInProgress: [...inProgress].reduce(
      (sum, code) => sum + (course.get(code)?.credits ?? 3),
      0,
    ),
    cgpa: cgpa(attempts),
    currentSemester: intake ? semesterNumber(intake, term.code) : null,
  };
}

/** Students whose records the viewer may open, for the record lookup (staff and teachers). */
export async function recordStudents(viewer: UserDoc, q: string): Promise<StudentRecordRefDTO[]> {
  const filter: Record<string, unknown> = { role: 'student', active: true };
  if (q) {
    const rx = containsText(q);
    filter.$or = [{ name: rx }, { regNo: rx }];
  }
  const isOffice = viewer.role === 'admin' || (viewer.role === 'staff' && viewer.office === 'EXAM');
  if (!isOffice) {
    if (viewer.role !== 'faculty') return [];
    const [taught, advised] = await Promise.all([
      CourseOffering.find({ instructorId: viewer._id }).distinct('studentIds'),
      Section.find({ batchAdvisorId: viewer._id }).distinct('_id'),
    ]);
    const or: Record<string, unknown>[] = [
      { _id: { $in: taught } },
      { sectionId: { $in: advised } },
    ];
    if (viewer.isHOD && viewer.departmentId) or.push({ departmentId: viewer.departmentId });
    filter.$and = [{ $or: or }];
  }
  const [students, org] = await Promise.all([
    User.find(filter).sort({ regNo: 1 }).limit(40).lean<UserDoc[]>(),
    getOrgLookup(),
  ]);
  return students.map((s) => studentRef(s, org));
}
