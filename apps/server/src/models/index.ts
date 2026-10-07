import { AuditLog } from './AuditLog';
import { CourseOffering } from './CourseOffering';
import { Department } from './Department';
import { Group } from './Group';
import { Membership } from './Membership';
import { Message } from './Message';
import { Section } from './Section';
import { User } from './User';

export * from './AuditLog';
export * from './CourseOffering';
export * from './Department';
export * from './Group';
export * from './Membership';
export * from './Message';
export * from './Section';
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
] as const;

/** Builds every index (unique constraints must exist before traffic arrives). */
export async function initModels(): Promise<void> {
  await Promise.all(ALL_MODELS.map((m) => m.init()));
}
