import { Assessment } from './Assessment';
import { AttendanceRecord } from './AttendanceRecord';
import { AttendanceSession } from './AttendanceSession';
import { AuditLog } from './AuditLog';
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
import { Membership } from './Membership';
import { Message } from './Message';
import { Notification } from './Notification';
import { Program } from './Program';
import { Result } from './Result';
import { Room } from './Room';
import { SeatAssignment } from './SeatAssignment';
import { Section } from './Section';
import { Term } from './Term';
import { User } from './User';

export * from './Assessment';
export * from './AttendanceRecord';
export * from './AttendanceSession';
export * from './AuditLog';
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
export * from './Membership';
export * from './Message';
export * from './Notification';
export * from './Program';
export * from './Result';
export * from './Room';
export * from './SeatAssignment';
export * from './Section';
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
] as const;

/** Models whose index definitions changed since launch: stale indexes are dropped and rebuilt. */
const SYNCED_MODELS = new Set<unknown>([CourseOffering]);

/** Builds every index (unique constraints must exist before traffic arrives). */
export async function initModels(): Promise<void> {
  await Promise.all(ALL_MODELS.map((m) => (SYNCED_MODELS.has(m) ? m.syncIndexes() : m.init())));
}
