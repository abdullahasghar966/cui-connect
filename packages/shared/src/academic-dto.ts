/** Wire formats of the university features (terms, rooms, catalog, programs, notifications…). */
import type { ClassKind, RoomKind } from './academics';
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
