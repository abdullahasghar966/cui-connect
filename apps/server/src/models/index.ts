import { AuditLog } from './AuditLog';
import { CatalogCourse } from './CatalogCourse';
import { CourseOffering } from './CourseOffering';
import { Department } from './Department';
import { Group } from './Group';
import { Membership } from './Membership';
import { Message } from './Message';
import { Notification } from './Notification';
import { Program } from './Program';
import { Room } from './Room';
import { Section } from './Section';
import { Term } from './Term';
import { User } from './User';

export * from './AuditLog';
export * from './CatalogCourse';
export * from './CourseOffering';
export * from './Department';
export * from './Group';
export * from './Membership';
export * from './Message';
export * from './Notification';
export * from './Program';
export * from './Room';
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
] as const;

/** Models whose index definitions changed since launch: stale indexes are dropped and rebuilt. */
const SYNCED_MODELS = new Set<unknown>([CourseOffering]);

/** Builds every index (unique constraints must exist before traffic arrives). */
export async function initModels(): Promise<void> {
  await Promise.all(ALL_MODELS.map((m) => (SYNCED_MODELS.has(m) ? m.syncIndexes() : m.init())));
}
