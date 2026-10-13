/** Wire formats of the university features (terms, rooms, catalog, programs, notifications…). */
import type {
  AssessmentType,
  AttendanceMethod,
  AttendanceStatus,
  AttendanceSummary,
  CalendarKind,
  ClassKind,
  CourseStanding,
  ExamKind,
  GradingWeights,
  RoomKind,
} from './academics';
import type { BookingStatus } from './bookings';
import type {
  BusStop,
  EventCategory,
  EventStatus,
  ItemCategory,
  JobKind,
  LostFoundKind,
  OpeningHours,
  PlaceKind,
  RsvpStatus,
} from './campus';
import type { NotificationType, Office } from './constants';
import type { QuizStatus } from './coursework';
import type { PublicUserDTO } from './dto';
import type { EvaluationSummary } from './evaluation';
import type { FeeInstalment, FeeItem, FeeStatus } from './fees';
import type {
  OfferSlot,
  RegistrationIssue,
  RegistrationMode,
  RegistrationStatus,
  StudentRecordLike,
} from './registration';
import type { ComplaintCategory, IdCardReason, RequestKind, RequestStatus } from './requests';

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
  /** Cancelled by a holiday or exam period on the academic calendar (not by the teacher). */
  suspended: boolean;
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
  marks: { assessments: number; published: number; finalized: boolean };
}

// ---- Marks and results ----

export interface GradeDTO {
  percent: number;
  grade: string;
  points: number;
}

export interface AssessmentDTO {
  id: string;
  type: AssessmentType;
  title: string;
  total: number;
  date: string | null;
  published: boolean;
  publishedAt: string | null;
  stats: { marked: number; average: number | null; highest: number | null; lowest: number | null };
}

/** The teacher's marks grid for one course. */
export interface MarksSheetDTO {
  course: CourseRefDTO;
  credits: number;
  grading: GradingWeights;
  customGrading: boolean;
  /** Oldest first; the columns of the grid. */
  assessments: AssessmentDTO[];
  students: {
    student: { id: string; name: string; regNo: string | null };
    /** One per assessment, in the same order (null = not entered). */
    marks: (number | null)[];
    standing: CourseStanding;
    projected: GradeDTO | null;
    final: GradeDTO | null;
  }[];
  finalizedAt: string | null;
  canManage: boolean;
}

/** One course on a student's Results page (published marks only). */
export interface StudentCourseResultDTO {
  course: CourseRefDTO;
  credits: number;
  grading: GradingWeights;
  assessments: {
    id: string;
    type: AssessmentType;
    title: string;
    total: number;
    date: string | null;
    obtained: number | null;
    classAverage: number | null;
  }[];
  standing: CourseStanding;
  projected: GradeDTO | null;
  final: GradeDTO | null;
}

export interface TermResultDTO {
  term: { code: string; name: string };
  gpa: number | null;
  credits: number;
  courses: { code: string; title: string; credits: number; grade: string; points: number }[];
}

export interface MyResultsDTO {
  term: { code: string; name: string };
  courses: StudentCourseResultDTO[];
  /** From this term's projected grades (not official until grades are final). */
  projectedGpa: number | null;
  /** Official, from final results of every term (latest attempt of a repeated course). */
  cgpa: number | null;
  creditsEarned: number;
  /** Newest first. */
  history: TermResultDTO[];
}

// ---- Calendar ----

export interface CalendarEventDTO {
  id: string;
  title: string;
  kind: CalendarKind;
  startsOn: string;
  endsOn: string;
  description: string | null;
}

/** One entry on a person's own calendar: a class, a paper, or an academic calendar entry. */
export interface CalendarItemDTO {
  id: string;
  kind: 'class' | 'exam' | 'academic' | 'booking' | 'event';
  title: string;
  detail: string | null;
  date: string;
  /** Null for all-day entries. */
  start: string | null;
  end: string | null;
  link: string | null;
  /** Classes: cancelled (also on holidays) or moved here from another date. */
  status: 'cancelled' | 'moved' | null;
  /** Academic entries: what kind of date it is. */
  category: CalendarKind | null;
  /** Academic entries that span several days: the last one (repeated on each day it covers). */
  endsOn: string | null;
}

// ---- Student records: transcript and degree progress ----

export interface StudentRecordRefDTO {
  id: string;
  name: string;
  regNo: string | null;
  sectionName: string | null;
  programCode: string | null;
}

export interface TranscriptDTO {
  student: StudentRecordRefDTO & {
    programName: string | null;
    departmentName: string | null;
    intake: string | null;
  };
  /** Oldest first. */
  terms: TermResultDTO[];
  cgpa: number | null;
  creditsEarned: number;
  creditsRequired: number | null;
  generatedAt: string;
}

export type PlanCourseStatus = 'passed' | 'failed' | 'current' | 'planned';

export interface DegreeProgressDTO {
  student: StudentRecordRefDTO;
  program: { code: string; name: string; totalCredits: number } | null;
  semesters: {
    semester: number;
    courses: {
      code: string;
      title: string;
      credits: number;
      status: PlanCourseStatus;
      grade: string | null;
      term: string | null;
    }[];
  }[];
  /** Courses passed that aren't in the plan (electives, transfers). */
  outsidePlan: { code: string; title: string; credits: number; grade: string }[];
  creditsEarned: number;
  creditsInProgress: number;
  cgpa: number | null;
  currentSemester: number | null;
}

// ---- Directory and search ----

export interface OfficeHourDTO {
  day: number;
  start: string;
  end: string;
}

export interface TeacherDTO {
  user: PublicUserDTO;
  departmentName: string | null;
  officeLocation: string | null;
  officeHours: OfficeHourDTO[];
  /** This term's teaching. */
  courses: { code: string; title: string; sectionName: string | null }[];
  /** The viewer may start a direct message (the DM rules decide). */
  canMessage: boolean;
}

export interface MessageHitDTO {
  id: string;
  groupId: string;
  groupName: string;
  sender: string;
  /** A short piece of the message around the match. */
  snippet: string;
  createdAt: string;
}

export interface SearchResultsDTO {
  courses: { code: string; title: string; departmentCode: string | null }[];
  teachers: {
    id: string;
    name: string;
    designation: string | null;
    departmentCode: string | null;
  }[];
  rooms: { id: string; name: string; block: string }[];
  /** Only from chats the viewer may read. */
  messages: MessageHitDTO[];
}

// ---- Room finder ----

export interface RoomBookingDTO {
  kind: 'class' | 'exam';
  start: string;
  end: string;
  /** e.g. `CSC337 Advanced Web Technologies`. */
  title: string;
  /** e.g. `BCS-7A · Dr. Imran Haider` or `Sessional II`. */
  detail: string;
}

export interface RoomStatusDTO {
  room: RoomDTO;
  /** What is in the room at the chosen time. */
  current: RoomBookingDTO | null;
  /** When it is free: until the next booking (null = for the rest of the day). */
  freeUntil: string | null;
  /** The whole day, in order. */
  bookings: RoomBookingDTO[];
}

export interface RoomFinderDTO {
  date: string;
  time: string;
  rooms: RoomStatusDTO[];
}

// ---- Exams ----

export interface ExamRoomDTO extends RoomRefDTO {
  /** Exam seats (rows × seats per row). */
  seats: number;
}

/** One paper on the date sheet: a course code, sat by one or more sections together. */
export interface ExamDTO {
  id: string;
  kind: ExamKind;
  code: string;
  title: string;
  sections: { offeringId: string; sectionName: string | null; students: number }[];
  date: string;
  start: string;
  end: string;
  rooms: ExamRoomDTO[];
  published: boolean;
  students: number;
  seats: number;
  /** Students with a seat (0 until seats are assigned). */
  seated: number;
}

/** What the Exam Office can put on the date sheet: this term's courses and the exam rooms. */
export interface ExamOptionsDTO {
  courses: {
    code: string;
    title: string;
    offerings: { offeringId: string; sectionName: string | null; students: number }[];
  }[];
  rooms: ExamRoomDTO[];
}

export interface ExamCheckDTO {
  blocking: string[];
  warnings: string[];
}

/** A paper on a student's or teacher's own date sheet. */
export interface MyExamDTO {
  id: string;
  kind: ExamKind;
  code: string;
  title: string;
  date: string;
  start: string;
  end: string;
  rooms: RoomRefDTO[];
  /** The student's seat once assigned (always null for teachers). */
  seat: { room: RoomRefDTO; row: number; seat: number } | null;
  /** Teachers: the sections of theirs sitting this paper. */
  sections: string[];
}

export interface SeatingChartDTO {
  exam: ExamDTO;
  rooms: {
    room: ExamRoomDTO;
    rows: number;
    cols: number;
    seats: {
      row: number;
      seat: number;
      student: { id: string; name: string; regNo: string | null; sectionName: string | null };
    }[];
  }[];
  unseated: number;
}

export interface CampusSettingsDTO {
  minAttendance: number;
  /** Course registration follows the calendar, or is opened or closed by hand. */
  registrationMode: RegistrationMode;
  /** Students can evaluate their teachers (the Director's Office opens it near the end of term). */
  evaluationOpen: boolean;
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

// ---- Coursework: files, assignments, materials, live quizzes ----

export interface FileDTO {
  id: string;
  name: string;
  size: number;
  /** Served type, e.g. `application/pdf`. */
  type: string;
  /** Download path. */
  url: string;
  uploadedAt: string;
}

export interface AssignmentDTO {
  id: string;
  course: CourseRefDTO;
  title: string;
  instructions: string | null;
  /** ISO instants. */
  dueAt: string;
  /** Late work is accepted until then (null = not accepted). */
  lateUntil: string | null;
  total: number;
  attachments: FileDTO[];
  /** The marks-sheet column the grades go into. */
  assessmentId: string;
  /** Grades returned to students (the column is published). */
  returned: boolean;
  createdAt: string;
}

export interface SubmissionDTO {
  files: FileDTO[];
  note: string | null;
  submittedAt: string;
  late: boolean;
}

export interface SubmissionRowDTO {
  student: { id: string; name: string; regNo: string | null };
  submission: SubmissionDTO | null;
  obtained: number | null;
  feedback: string | null;
}

export interface AssignmentDetailDTO {
  assignment: AssignmentDTO;
  canManage: boolean;
  /** Students: their own submission. */
  mine: SubmissionDTO | null;
  /** Students, once grades are returned: their mark and the teacher's comments. */
  grade: { obtained: number | null; feedback: string | null } | null;
  /** The instructor and those who may see the class's records: every enrolled student. */
  submissions: SubmissionRowDTO[] | null;
  stats: { enrolled: number; submitted: number; late: number; graded: number } | null;
}

/** Where a student stands with an assignment. */
export type AssignmentState = 'todo' | 'submitted' | 'late' | 'missing' | 'graded';

export interface AssignmentSummaryDTO {
  id: string;
  course: CourseRefDTO;
  title: string;
  dueAt: string;
  lateUntil: string | null;
  total: number;
  returned: boolean;
  /** Students only. */
  state: AssignmentState | null;
  obtained: number | null;
  /** Teachers only: how many have handed in, out of how many. */
  submitted: number | null;
  enrolled: number | null;
}

export interface MaterialDTO {
  id: string;
  week: number;
  title: string;
  description: string | null;
  file: FileDTO | null;
  url: string | null;
  createdAt: string;
}

export interface QuizSummaryDTO {
  id: string;
  course: CourseRefDTO;
  title: string;
  status: QuizStatus;
  questionCount: number;
  totalPoints: number;
  startedAt: string | null;
  endedAt: string | null;
  /** Students: their score once the quiz has ended. */
  myScore: number | null;
  /** Teachers: how many students answered at least once. */
  participants: number | null;
  savedToMarks: boolean;
}

export interface CourseworkCourseDTO {
  course: CourseRefDTO;
  canManage: boolean;
  assignments: AssignmentSummaryDTO[];
  materials: MaterialDTO[];
  quizzes: QuizSummaryDTO[];
}

export interface CourseworkOverviewDTO {
  courses: {
    course: CourseRefDTO;
    canManage: boolean;
    assignments: number;
    /** Students: still to hand in; teachers: submissions waiting for a grade. */
    pending: number;
    materials: number;
  }[];
  /** Students: work still to hand in (soonest first); teachers: assignments not yet past due. */
  upcoming: AssignmentSummaryDTO[];
  /** Quizzes running right now in the viewer's courses. */
  live: QuizSummaryDTO[];
}

export interface QuizQuestionDTO {
  id: string;
  text: string;
  options: string[];
  /** Index of the right option: the host always, students once it's revealed. */
  correct: number | null;
  points: number;
  seconds: number;
}

export interface QuizRankDTO {
  rank: number;
  studentId: string;
  name: string;
  score: number;
}

/** A quiz as the viewer sees it right now (host or student). */
export interface QuizViewDTO {
  id: string;
  course: CourseRefDTO;
  title: string;
  status: QuizStatus;
  isHost: boolean;
  questionCount: number;
  totalPoints: number;
  /** Host only: every question with its answer (editing and the host screen). */
  questions: QuizQuestionDTO[] | null;
  /** -1 before the first question. */
  current: number;
  question:
    | (QuizQuestionDTO & {
        index: number;
        revealed: boolean;
        /** Time left to answer when this was sent (0 once revealed). */
        remainingMs: number;
        /** Answers per option: the host live, everyone once revealed. */
        counts: number[] | null;
      })
    | null;
  /** Host: answers to the current question and students on the quiz page. */
  answered: number;
  joined: number;
  /** Top five once a question is revealed or the quiz ended; the host sees everyone. */
  leaderboard: QuizRankDTO[];
  /** Students: their answers so far (question id → option), score and rank. */
  mine: { answers: Record<string, number>; score: number; rank: number | null } | null;
  /** Host: the marks-sheet column the scores were saved to. */
  assessmentId: string | null;
  /** Host: how each question went, to see what the class found hard. */
  breakdown: { questionId: string; answered: number; correct: number }[] | null;
}

// ---- Office-hour appointments ----

export interface BookingDTO {
  id: string;
  teacher: { id: string; name: string };
  student: { id: string; name: string; regNo: string | null };
  date: string;
  start: string;
  end: string;
  topic: string;
  /** The teacher's office, where the meeting is. */
  location: string | null;
  status: BookingStatus;
  cancelledBy: 'teacher' | 'student' | null;
  cancelReason: string | null;
  createdAt: string;
}

export interface BookingSlotDTO {
  start: string;
  end: string;
  /** Someone has it (or it has passed). */
  taken: boolean;
  /** Your own appointment. */
  mine: boolean;
}

/** A teacher's bookable office-hour slots for the next two weeks. */
export interface TeacherSlotsDTO {
  teacher: { id: string; name: string; officeLocation: string | null };
  canBook: boolean;
  /** Why booking isn't possible, in plain words. */
  reason: string | null;
  days: { date: string; slots: BookingSlotDTO[] }[];
}

// ---- Requests and complaints ----

/** What the student filled in (only the fields of its kind are set). */
export interface RequestDetailsDTO {
  from?: string;
  to?: string;
  reason?: string;
  purpose?: string;
  copies?: number;
  cardReason?: IdCardReason;
  category?: ComplaintCategory;
  subject?: string;
  description?: string;
}

export interface RequestEventDTO {
  at: string;
  /** Null for the system (e.g. the request being sent). */
  by: { id: string; name: string } | null;
  kind: 'created' | 'status' | 'reply';
  status: RequestStatus | null;
  body: string | null;
}

export interface ServiceRequestDTO {
  id: string;
  kind: RequestKind;
  title: string;
  status: RequestStatus;
  student: { id: string; name: string; regNo: string | null; sectionName: string | null };
  /** "Your batch advisor, Dr. Imran Haider" or "Examination Office". */
  handledBy: string;
  details: RequestDetailsDTO;
  events: RequestEventDTO[];
  createdAt: string;
  updatedAt: string;
  /** The viewer can move it on (see `nextStatuses`). */
  canHandle: boolean;
}

// ---- Course registration ----

export interface TermRefDTO {
  /** Null until the term has been created (the first offer creates it). */
  id: string | null;
  code: string;
  name: string;
}

/** A course section offered for the coming term. */
export interface RegistrationOfferDTO {
  id: string;
  code: string;
  title: string;
  credits: number;
  labCredits: number;
  prerequisites: string[];
  section: { id: string; name: string };
  departmentCode: string | null;
  instructor: { id: string; name: string } | null;
  capacity: number;
  seatsTaken: number;
  seatsLeft: number;
  slots: OfferSlot[];
  /** The viewer may edit or remove it (that department's office, or IT). */
  canManage: boolean;
}

export interface RegistrationWindowDTO {
  open: boolean;
  mode: RegistrationMode;
  /** The academic calendar's registration dates (now or next), if any. */
  startsOn: string | null;
  endsOn: string | null;
  /** The viewer may open or close it (Director's Office or IT). */
  canChange: boolean;
}

export interface RegistrationEventDTO {
  at: string;
  by: { id: string; name: string } | null;
  kind: 'submitted' | 'withdrawn' | 'approved' | 'returned';
  body: string | null;
}

export interface RegistrationDTO {
  id: string;
  term: { id: string; code: string; name: string };
  student: { id: string; name: string; regNo: string | null; sectionName: string | null };
  status: RegistrationStatus;
  offers: RegistrationOfferDTO[];
  credits: number;
  /** Checked now (offers can change after a plan is sent). */
  issues: RegistrationIssue[];
  /** "Dr. Imran Haider (batch advisor)". */
  handledBy: string;
  events: RegistrationEventDTO[];
  submittedAt: string | null;
  updatedAt: string;
  /** The viewer approves or returns it. */
  canHandle: boolean;
}

/** Everything the registration page needs. */
export interface RegistrationHomeDTO {
  term: TermRefDTO;
  window: RegistrationWindowDTO;
  offers: RegistrationOfferDTO[];
  /** Students: their plan (null before they save one), their record and their section. */
  registration: RegistrationDTO | null;
  record: StudentRecordLike | null;
  sectionId: string | null;
  /** Plans waiting for the viewer's decision. */
  waiting: number;
  /** The viewer manages offers (a department office or IT). */
  canManageOffers: boolean;
}

export interface OfferStudentDTO {
  id: string;
  name: string;
  regNo: string | null;
  sectionName: string | null;
  status: 'submitted' | 'approved';
}

// ---- Campus events ----

export interface CampusEventDTO {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  date: string;
  start: string;
  end: string;
  venue: string;
  organiser: string;
  /** Null when there's no limit on who can come. */
  capacity: number | null;
  going: number;
  interested: number;
  status: EventStatus;
  createdBy: { id: string; name: string };
  /** Student Affairs' note when it wasn't approved, or the reason it was cancelled. */
  note: string | null;
  /** The viewer's own answer. */
  myRsvp: RsvpStatus | null;
  /** The viewer created it, or moderates events (Student Affairs, IT). */
  canEdit: boolean;
  /** The viewer approves events (Student Affairs, IT). */
  canModerate: boolean;
}

export interface EventsHomeDTO {
  upcoming: CampusEventDTO[];
  past: CampusEventDTO[];
  /** Moderators: everything waiting; others: their own events that aren't published. */
  waiting: CampusEventDTO[];
  canPublish: boolean;
  /** Student Affairs or IT: approves events. */
  canModerate: boolean;
}

export interface EventDetailDTO extends CampusEventDTO {
  /** Who is going (for its organiser and moderators only). */
  attendees: { id: string; name: string; detail: string | null }[] | null;
}

export interface EventRsvpEvent {
  eventId: string;
  going: number;
  interested: number;
}

// ---- Jobs and internships ----

export interface JobDTO {
  id: string;
  title: string;
  company: string;
  kind: JobKind;
  location: string;
  description: string;
  applyUrl: string | null;
  applyEmail: string | null;
  deadline: string;
  /** Programmes it is meant for (empty: everyone). */
  programs: string[];
  postedBy: { id: string; name: string };
  postedAt: string;
  /** Past its deadline, or closed early. */
  closed: boolean;
  saved: boolean;
}

export interface JobsHomeDTO {
  open: JobDTO[];
  saved: JobDTO[];
  /** Student Affairs and IT: closed and expired posts. */
  closed: JobDTO[];
  canManage: boolean;
}

// ---- Lost & found ----

export interface LostClaimDTO {
  id: string;
  user: { id: string; name: string; detail: string | null };
  message: string;
  createdAt: string;
  accepted: boolean;
}

export interface LostItemDTO {
  id: string;
  kind: LostFoundKind;
  title: string;
  category: ItemCategory;
  description: string | null;
  place: string;
  date: string;
  photo: FileDTO | null;
  reporter: { id: string; name: string };
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
  /** Reported by the viewer. */
  mine: boolean;
  /** The reporter or Student Affairs (IT) may close it. */
  canResolve: boolean;
  /** Everyone's claims, for those who may resolve it; otherwise null. */
  claims: LostClaimDTO[] | null;
  /** The viewer's own claim, if any. */
  myClaim: LostClaimDTO | null;
  claimCount: number;
}

export interface LostFoundHomeDTO {
  /** Open reports, newest first. */
  items: LostItemDTO[];
  /** The viewer's own reports (open and resolved). */
  mine: LostItemDTO[];
  /** Recently returned items. */
  resolved: LostItemDTO[];
}

// ---- Transport ----

export interface BusRouteDTO {
  id: string;
  name: string;
  bus: string;
  capacity: number;
  days: number[];
  /** From the farthest stop to campus. */
  stops: BusStop[];
  notes: string | null;
  /** For staff and IT only (null for students and teachers). */
  driver: { name: string | null; phone: string | null } | null;
  /** Today's notice (e.g. running late), if any. */
  notice: string | null;
  saved: boolean;
  /** The stop the viewer saved with the route. */
  myStop: string | null;
  updatedAt: string;
}

export interface TransportDTO {
  routes: BusRouteDTO[];
  /** IT manages routes and posts notices. */
  canManage: boolean;
}

// ---- Campus map ----

/** An office or facility on the map, with its opening hours. */
export interface CampusPlaceDTO {
  id: string;
  name: string;
  kind: PlaceKind;
  block: string;
  floor: number | null;
  description: string | null;
  office: Office | null;
  hours: OpeningHours[];
  /** Open at this moment (campus time); null when no hours are set. */
  openNow: boolean | null;
}

export interface CampusPlacesDTO {
  places: CampusPlaceDTO[];
  /** IT edits places. */
  canManage: boolean;
}

// ---- Teacher evaluation ----

/** A course a student can evaluate this term. */
export interface EvaluationCourseDTO {
  offeringId: string;
  code: string;
  title: string;
  sectionName: string;
  teacher: { id: string; name: string } | null;
  /** The student has answered (only a receipt says so; the answers carry no name). */
  done: boolean;
}

/** One course's results line for a teacher, HOD, the Director's Office or IT. */
export interface EvaluationRowDTO {
  offeringId: string;
  code: string;
  title: string;
  sectionName: string;
  departmentCode: string | null;
  teacher: { id: string; name: string } | null;
  enrolled: number;
  responses: number;
  /** Null while results are hidden (still open, or too few answers). */
  overall: number | null;
}

export interface EvaluationHomeDTO {
  term: { id: string; code: string; name: string };
  open: boolean;
  /** The viewer opens and closes evaluation (Director's Office or IT). */
  canChangeWindow: boolean;
  /** Students: their courses. */
  courses: EvaluationCourseDTO[];
  /** Teachers, HODs, the Director's Office and IT: the courses whose results they may see. */
  rows: EvaluationRowDTO[];
}

export interface EvaluationReportDTO {
  offeringId: string;
  term: { id: string; code: string; name: string };
  code: string;
  title: string;
  sectionName: string;
  teacher: { id: string; name: string } | null;
  enrolled: number;
  responses: number;
  /** Why results are hidden; null when they are shown. */
  hiddenReason: string | null;
  summary: EvaluationSummary | null;
}

// ---- Fees ----

export interface FeeChallanDTO {
  id: string;
  challanNo: string;
  term: { id: string; code: string; name: string };
  instalment: FeeInstalment;
  student: {
    id: string;
    name: string;
    regNo: string | null;
    sectionName: string | null;
    program: string | null;
    departmentName: string | null;
  };
  items: FeeItem[];
  total: number;
  lateFee: number;
  dueDate: string;
  status: FeeStatus;
  /** What to pay today (with the late fee once overdue), or what was paid. */
  payable: number;
  paidOn: string | null;
  bankRef: string | null;
  issuedAt: string;
}

export interface MyFeesDTO {
  /** Newest first. */
  challans: FeeChallanDTO[];
  /** Everything unpaid, with late fees, as of today. */
  outstanding: number;
}

export interface FeeDeskDTO {
  term: { id: string; code: string; name: string };
  /** Counts and sums over the filtered challans (whatever their status). */
  stats: {
    challans: number;
    paid: number;
    due: number;
    overdue: number;
    collected: number;
    outstanding: number;
  };
  rows: FeeChallanDTO[];
  /** More challans matched than were sent. */
  truncated: boolean;
}

export interface IssueChallansResultDTO {
  issued: number;
  /** Students who already had a challan of this kind this term. */
  skipped: number;
}
