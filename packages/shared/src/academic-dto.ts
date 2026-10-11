/** Wire formats of the university features (terms, rooms, catalog, programs, notifications…). */
import type {
  AttendanceMethod,
  AttendanceStatus,
  AttendanceSummary,
  ClassKind,
  GradingWeights,
  RoomKind,
} from './academics';
import type { NotificationType } from './constants';

export interface TermDTO {
  id: string;
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
  current: boolean;
}

export interface RoomDTO {
  id: string;
  name: string;
  block: string;
  floor: number | null;
  kind: RoomKind;
  capacity: number;
  /** Exam seating layout: rows × seats per row (0 = not used for exams). */
  examRows: number;
  examCols: number;
}

export interface CatalogCourseDTO {
  code: string;
  title: string;
  departmentId: string | null;
  departmentCode: string | null;
  credits: number;
  labCredits: number;
  description: string | null;
  prerequisites: string[];
  clos: { code: string; text: string }[];
  outline: { week: number; topic: string }[];
  /** Sections offering it in the current term. */
  offeredSections: number;
}

export interface DepartmentRefDTO {
  id: string;
  code: string;
  name: string;
}

/** One section taking a course this term, as listed on the course page. */
export interface CourseSectionDTO {
  offeringId: string;
  sectionId: string;
  sectionName: string | null;
  instructor: { id: string; name: string } | null;
  enrolled: number;
  /** Seats at registration (null = no limit). */
  capacity: number | null;
  schedule: {
    day: number;
    start: string;
    end: string;
    kind: ClassKind;
    room: RoomRefDTO | null;
  }[];
  /** This section's grading weights (its own, or the campus default). */
  grading: GradingWeights;
  customGrading: boolean;
  /** The course chat, only for its members. */
  groupId: string | null;
  /** The viewer teaches or is enrolled in this section. */
  mine: boolean;
  /** The viewer may open the section's attendance sheet (its teacher, HOD, Exam Office, IT). */
  canViewRecords: boolean;
}

export interface CourseDetailDTO {
  course: CatalogCourseDTO;
  term: { code: string; name: string };
  /** Prerequisites with titles (null when a code isn't in the catalog). */
  prerequisites: { code: string; title: string | null }[];
  /** Courses that list this one as a prerequisite. */
  leadsTo: { code: string; title: string }[];
  /** Degree plans that include it, and in which semester. */
  programs: { code: string; name: string; semester: number }[];
  sections: CourseSectionDTO[];
}

export interface ProgramDTO {
  id: string;
  code: string;
  name: string;
  departmentId: string;
  departmentCode: string | null;
  totalCredits: number;
  plan: { semester: number; courses: string[] }[];
}

export interface SectionRefDTO {
  id: string;
  name: string;
  program: string;
  intake: string;
  departmentCode: string | null;
}

// ---- Timetable ----

export interface RoomRefDTO {
  id: string;
  name: string;
  block: string;
}

/** A weekly class: every Monday 8:30–10:00, CSC337 BCS-7A in Lab 3. */
export interface ClassSlotDTO {
  id: string;
  offeringId: string;
  code: string;
  title: string;
  sectionId: string;
  sectionName: string | null;
  instructor: { id: string; name: string } | null;
  room: RoomRefDTO | null;
  day: number;
  start: string;
  end: string;
  kind: ClassKind;
  /** The course chat, for "Open chat" (null for people who aren't in it). */
  groupId: string | null;
  studentCount: number;
}

/**
 * One class on one date. `moved-out` is the original time of a rescheduled class (shown
 * crossed out); `moved-in` is where it went.
 */
export type OccurrenceStatus = 'scheduled' | 'cancelled' | 'moved-out' | 'moved-in';

export interface ClassOccurrenceDTO {
  slot: ClassSlotDTO;
  date: string;
  start: string;
  end: string;
  room: RoomRefDTO | null;
  status: OccurrenceStatus;
  note: string | null;
  movedTo: { date: string; start: string; end: string } | null;
  movedFrom: { date: string; start: string } | null;
  /** The instructor (and IT) can cancel, move or restore this class. */
  canChange: boolean;
}

export interface TimetableWeekDTO {
  /** Monday of the week shown. */
  weekStart: string;
  term: { code: string; name: string; startsOn: string; endsOn: string };
  title: string;
  days: { date: string; weekday: number; occurrences: ClassOccurrenceDTO[] }[];
}

export interface TodayDTO {
  date: string;
  current: ClassOccurrenceDTO | null;
  next: ClassOccurrenceDTO | null;
  /** Today's classes, in order (including finished and cancelled ones). */
  today: ClassOccurrenceDTO[];
}

/** Result of checking a weekly class against the rest of the timetable. */
export interface SlotCheckDTO {
  /** Refused: the room, teacher or section is already busy. */
  blocking: string[];
  /** Allowed, but worth knowing (shared students, room too small). */
  warnings: string[];
}

// ---- Attendance ----

export interface CourseRefDTO {
  offeringId: string;
  code: string;
  title: string;
  sectionName: string | null;
}

export interface AttendanceCountsDTO {
  enrolled: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  unmarked: number;
}

export interface AttendanceSessionDTO {
  id: string;
  course: CourseRefDTO;
  date: string;
  /** Start of the timetabled class, when attendance was taken for one. */
  start: string | null;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt: string | null;
  counts: AttendanceCountsDTO;
}

export interface RosterEntryDTO {
  student: { id: string; name: string; regNo: string | null };
  status: AttendanceStatus | null;
  method: AttendanceMethod | null;
  markedAt: string | null;
}

export interface AttendanceSessionDetailDTO {
  session: AttendanceSessionDTO;
  roster: RosterEntryDTO[];
  /** The viewer runs the course (can mark students and close the session). */
  canManage: boolean;
}

/** What the classroom screen shows: a code valid for this window and the last one. */
export interface AttendanceQrDTO {
  token: string;
  /** In-app path the QR code opens: `/attend/<session>?t=<token>`. */
  path: string;
  /** Time left in the current window (measured on the server, so clock skew doesn't matter). */
  remainingMs: number;
  windowSeconds: number;
}

export interface CheckInResultDTO {
  status: AttendanceStatus;
  /** The student had already checked in to this session. */
  already: boolean;
  course: CourseRefDTO;
  date: string;
}

export interface MyAttendanceCourseDTO {
  course: CourseRefDTO;
  summary: AttendanceSummary;
  minimum: number;
  /** Oldest first. */
  sessions: { date: string; status: AttendanceStatus }[];
}

export interface AttendanceSheetDTO {
  course: CourseRefDTO;
  minimum: number;
  /** Oldest first; the columns of the sheet. */
  sessions: AttendanceSessionDTO[];
  students: {
    student: { id: string; name: string; regNo: string | null };
    /** One per session, in the same order (null = not marked). */
    statuses: (AttendanceStatus | null)[];
    summary: AttendanceSummary;
  }[];
}

/** A course the viewer teaches, for the Attendance page. */
export interface TeachingCourseDTO {
  course: CourseRefDTO;
  enrolled: number;
  sessionsHeld: number;
  /** Class average attendance (null before the first session). */
  averagePercent: number | null;
  /** Students below the minimum. */
  short: number;
  openSessionId: string | null;
  /** Today's timetabled classes, for one-click "Take attendance". */
  today: { slotId: string; start: string; end: string }[];
}

export interface CampusSettingsDTO {
  minAttendance: number;
}

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** In-app path to open, e.g. `/academics/results`. */
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationsPage {
  notifications: NotificationDTO[];
  unread: number;
  hasMore: boolean;
}
