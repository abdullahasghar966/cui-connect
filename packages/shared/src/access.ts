/**
 * Who may see and change university records (timetable, attendance, marks, exams, fees…).
 *
 * The same idea as the communication policy in policy.ts: pure functions returning a
 * {@link Decision}, evaluated by the server on every request and by the web client only to
 * show or hide controls. Records are private by default: a student sees their own; the people
 * responsible for them (instructor, batch advisor, HOD, the right office, IT) see theirs.
 */
import { OFFICE_LABELS, type Office } from './constants';
import type { Decision, DenyCode, PolicyUser } from './policy';

const ALLOW: Decision = { allowed: true };
const deny = (code: DenyCode, reason: string): Decision => ({ allowed: false, code, reason });
const inactive = deny('INACTIVE', 'Your account is deactivated.');

const isAdmin = (user: PolicyUser) => user.role === 'admin';
const inOffice = (user: PolicyUser, office: Office) =>
  user.role === 'staff' && user.office === office;
const officeOnly = (office: Office, what: string) =>
  deny('OFFICE_ONLY', `Only the ${OFFICE_LABELS[office]} and IT Services can ${what}.`);

/** The facts about a course offering that the rules need. */
export interface OfferingFacts {
  instructorId: string | null;
  sectionId: string;
  departmentId: string | null;
  studentIds?: readonly string[];
}

const teaches = (user: PolicyUser, offering: OfferingFacts) =>
  user.role === 'faculty' && !!offering.instructorId && offering.instructorId === user.id;

const isHodOf = (user: PolicyUser, departmentId: string | null | undefined) =>
  user.role === 'faculty' && !!user.isHOD && !!departmentId && user.departmentId === departmentId;

/** Run the course: take attendance, enter and publish marks, change a class, post coursework. */
export function canManageOffering(user: PolicyUser, offering: OfferingFacts): Decision {
  if (!user.active) return inactive;
  if (isAdmin(user) || teaches(user, offering)) return ALLOW;
  return deny('NOT_ALLOWED', 'Only the instructor of this course can do that.');
}

/** See everything about a course offering, including every student's marks and attendance. */
export function canViewOfferingRecords(user: PolicyUser, offering: OfferingFacts): Decision {
  if (!user.active) return inactive;
  if (isAdmin(user) || teaches(user, offering) || isHodOf(user, offering.departmentId)) {
    return ALLOW;
  }
  if (inOffice(user, 'EXAM')) return ALLOW;
  return deny(
    'NOT_ALLOWED',
    "Only the course's instructor, the HOD and the Examination Office can see the whole class's records.",
  );
}

/** Take part as a student: check in, see your own marks, submit work. */
export function canStudyIn(user: PolicyUser, offering: OfferingFacts): Decision {
  if (!user.active) return inactive;
  if (user.role === 'student' && offering.studentIds?.includes(user.id)) return ALLOW;
  return deny('NOT_ENROLLED', 'You are not enrolled in this course.');
}

export interface StudentFacts {
  id: string;
  departmentId: string | null;
  sectionId: string | null;
}

export interface RecordRelation {
  /** The viewer teaches a course the student is enrolled in. */
  teachesStudent?: boolean;
  /** The viewer is the batch advisor of the student's section. */
  advisesStudent?: boolean;
}

/** A student's academic record (attendance, marks, transcript, exam seats). */
export function canViewStudentRecord(
  viewer: PolicyUser,
  student: StudentFacts,
  relation: RecordRelation = {},
): Decision {
  if (!viewer.active) return inactive;
  if (viewer.id === student.id || isAdmin(viewer) || inOffice(viewer, 'EXAM')) return ALLOW;
  if (viewer.role === 'faculty') {
    if (relation.teachesStudent || relation.advisesStudent) return ALLOW;
    if (isHodOf(viewer, student.departmentId)) return ALLOW;
  }
  return deny(
    'NOT_ALLOWED',
    'Academic records are private to the student and the people responsible for them.',
  );
}

/** Build and change the weekly timetable of a department. */
export function canManageTimetable(user: PolicyUser, departmentId: string | null): Decision {
  if (!user.active) return inactive;
  if (isAdmin(user)) return ALLOW;
  if (inOffice(user, 'DEPARTMENT') && departmentId && user.departmentId === departmentId) {
    return ALLOW;
  }
  return deny(
    'NOT_ALLOWED',
    'Only IT Services and the department office can change the timetable.',
  );
}

/** Edit the course catalog and degree plans of a department. */
export function canManageCatalog(user: PolicyUser, departmentId: string | null): Decision {
  if (!user.active) return inactive;
  if (isAdmin(user) || isHodOf(user, departmentId)) return ALLOW;
  if (inOffice(user, 'DEPARTMENT') && departmentId && user.departmentId === departmentId) {
    return ALLOW;
  }
  return deny(
    'NOT_ALLOWED',
    "Only IT Services, the department's HOD and its office can edit the catalog.",
  );
}

/** Campus-wide setup: terms, rooms, transport. */
export function canManageCampus(user: PolicyUser): Decision {
  if (!user.active) return inactive;
  return isAdmin(user) ? ALLOW : deny('NOT_ALLOWED', 'Only IT Services can change campus setup.');
}

export function canManageExams(user: PolicyUser): Decision {
  if (!user.active) return inactive;
  return isAdmin(user) || inOffice(user, 'EXAM')
    ? ALLOW
    : officeOnly('EXAM', 'manage exams and seating');
}

export function canManageFees(user: PolicyUser): Decision {
  if (!user.active) return inactive;
  return isAdmin(user) || inOffice(user, 'ACCOUNTS')
    ? ALLOW
    : officeOnly('ACCOUNTS', 'manage fees');
}

export function canManageCalendar(user: PolicyUser): Decision {
  if (!user.active) return inactive;
  return isAdmin(user) || inOffice(user, 'DIRECTOR')
    ? ALLOW
    : officeOnly('DIRECTOR', 'edit the academic calendar');
}

/** Jobs board, complaints, lost & found and approving events belong to Student Affairs. */
export function canManageStudentAffairs(user: PolicyUser): Decision {
  if (!user.active) return inactive;
  return isAdmin(user) || inOffice(user, 'STUDENT_AFFAIRS')
    ? ALLOW
    : officeOnly('STUDENT_AFFAIRS', 'do that');
}
