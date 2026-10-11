/** Loading one course offering with what every "run the course" feature needs (attendance, marks…). */
import {
  type CourseRefDTO,
  canManageOffering,
  canViewOfferingRecords,
  type Decision,
} from '@cui/shared';
import { assertAllowed, notFound } from '../lib/errors';
import {
  CourseOffering,
  type CourseOfferingDoc,
  type SectionDoc,
  User,
  type UserDoc,
} from '../models';
import { getOrgLookup, type OrgLookup, toObjectId, toPolicyUser } from './mappers';
import { offeringFacts } from './timetable';

export interface OfferingContext {
  offering: CourseOfferingDoc;
  section: SectionDoc | undefined;
  org: OrgLookup;
}

export async function loadOffering(offeringId: string): Promise<OfferingContext> {
  const offering = await CourseOffering.findById(toObjectId(offeringId)).lean<CourseOfferingDoc>();
  if (!offering) throw notFound('Course not found.');
  const org = await getOrgLookup();
  return { offering, section: org.sections.get(String(offering.sectionId)), org };
}

export function contextFor(offering: CourseOfferingDoc, org: OrgLookup): OfferingContext {
  return { offering, section: org.sections.get(String(offering.sectionId)), org };
}

export const courseRef = (ctx: OfferingContext): CourseRefDTO => ({
  offeringId: String(ctx.offering._id),
  code: ctx.offering.code,
  title: ctx.offering.title,
  sectionName: ctx.section?.name ?? null,
});

/** "AWT · BCS-7A"-style label for notifications and audit entries. */
export const courseLabel = (ctx: OfferingContext) =>
  `${ctx.offering.title} · ${ctx.section?.name ?? ''}`;

/** The course's instructor (or IT). */
export const manageDecision = (user: UserDoc, ctx: OfferingContext): Decision =>
  canManageOffering(toPolicyUser(user), offeringFacts(ctx.offering, ctx.section));

/** Throws unless the viewer runs the course or may see its records; says which. */
export function assertCanView(user: UserDoc, ctx: OfferingContext): { canManage: boolean } {
  if (manageDecision(user, ctx).allowed) return { canManage: true };
  assertAllowed(
    canViewOfferingRecords(toPolicyUser(user), offeringFacts(ctx.offering, ctx.section)),
  );
  return { canManage: false };
}

export type StudentLite = Pick<UserDoc, '_id' | 'name' | 'regNo'>;

/** Enrolled students, by registration number. */
export async function enrolledStudents(offering: CourseOfferingDoc): Promise<StudentLite[]> {
  const students = await User.find({ _id: { $in: offering.studentIds } })
    .select('name regNo')
    .lean<StudentLite[]>();
  return students.sort(
    (a, b) => (a.regNo ?? '').localeCompare(b.regNo ?? '') || a.name.localeCompare(b.name),
  );
}

export const studentRef = (s: StudentLite) => ({
  id: String(s._id),
  name: s.name,
  regNo: s.regNo,
});
