import { Assessment } from './Assessment';
import { Assignment } from './Assignment';
import { AttendanceRecord } from './AttendanceRecord';
import { AttendanceSession } from './AttendanceSession';
import { AuditLog } from './AuditLog';
import { Booking } from './Booking';
import { CalendarEvent } from './CalendarEvent';
import { CampusSettings } from './CampusSettings';
import { CatalogCourse } from './CatalogCourse';
import { ClassChange } from './ClassChange';
import { ClassSlot } from './ClassSlot';
import { CourseOffering } from './CourseOffering';
import { Department } from './Department';
import { Exam } from './Exam';
import { Group } from './Group';
import { Mark } from './Mark';
import { Material } from './Material';
import { Membership } from './Membership';
import { Message } from './Message';
import { Notification } from './Notification';
import { Program } from './Program';
import { PushSubscription } from './PushSubscription';
import { Quiz } from './Quiz';
import { QuizResponse } from './QuizResponse';
import { Result } from './Result';
import { Room } from './Room';
import { SeatAssignment } from './SeatAssignment';
import { Section } from './Section';
import { ServerKey } from './ServerKey';
import { StoredFile } from './StoredFile';
import { Submission } from './Submission';
import { Term } from './Term';
import { User } from './User';

export * from './Assessment';
export * from './Assignment';
export * from './AttendanceRecord';
export * from './AttendanceSession';
export * from './AuditLog';
export * from './Booking';
export * from './CalendarEvent';
export * from './CampusSettings';
export * from './CatalogCourse';
export * from './ClassChange';
export * from './ClassSlot';
export * from './CourseOffering';
export * from './Department';
export * from './Exam';
export * from './Group';
export * from './Mark';
export * from './Material';
export * from './Membership';
export * from './Message';
export * from './Notification';
export * from './Program';
export * from './PushSubscription';
export * from './Quiz';
export * from './QuizResponse';
export * from './Result';
export * from './Room';
export * from './SeatAssignment';
export * from './Section';
export * from './ServerKey';
export * from './StoredFile';
export * from './Submission';
export * from './Term';
export * from './User';

export const ALL_MODELS = [
  User,
  Department,
  Section,
  CourseOffering,
  Group,
  Membership,
  Message,
  AuditLog,
  Term,
  Room,
  CatalogCourse,
  Program,
  Notification,
  ClassSlot,
  ClassChange,
  AttendanceSession,
  AttendanceRecord,
  CampusSettings,
  Assessment,
  Mark,
  Result,
  Exam,
  SeatAssignment,
  CalendarEvent,
  StoredFile,
  Assignment,
  Submission,
  Material,
  Quiz,
  QuizResponse,
  Booking,
  PushSubscription,
  ServerKey,
] as const;

/** Campus data, wiped by a reseed or a fresh setup (server keys stay). */
export const DATA_MODELS = ALL_MODELS.filter((m) => m !== ServerKey);

/** Models whose index definitions changed since launch: stale indexes are dropped and rebuilt. */
const SYNCED_MODELS = new Set<unknown>([CourseOffering]);

/** Builds every index (unique constraints must exist before traffic arrives). */
export async function initModels(): Promise<void> {
  await Promise.all(ALL_MODELS.map((m) => (SYNCED_MODELS.has(m) ? m.syncIndexes() : m.init())));
}
