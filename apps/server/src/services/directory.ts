/** The teacher directory: where to find each teacher, when, what they teach, and whether you may message them. */
import { type OfficeInput, officeSchema, type TeacherDTO } from '@cui/shared';
import { badRequest, parse } from '../lib/errors';
import { containsText } from '../lib/text';
import { CourseOffering, type CourseOfferingDoc, User, type UserDoc } from '../models';
import { messageableIds } from './direct';
import { getOrgLookup, type OrgLookup, toObjectId, toPublicUserDTO } from './mappers';
import { currentTerm } from './terms';

function toTeacherDTO(
  teacher: UserDoc,
  org: OrgLookup,
  offerings: CourseOfferingDoc[],
  canMessage: boolean,
): TeacherDTO {
  return {
    user: toPublicUserDTO(teacher, org),
    departmentName: teacher.departmentId
      ? (org.departments.get(String(teacher.departmentId))?.name ?? null)
      : null,
    officeLocation: teacher.officeLocation ?? null,
    officeHours: [...(teacher.officeHours ?? [])].sort(
      (a, b) => a.day - b.day || a.start.localeCompare(b.start),
    ),
    courses: offerings
      .filter((o) => String(o.instructorId) === String(teacher._id))
      .map((o) => ({
        code: o.code,
        title: o.title,
        sectionName: org.sections.get(String(o.sectionId))?.name ?? null,
      }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    canMessage,
  };
}

export async function teacherDirectory(
  viewer: UserDoc,
  query: { q: string; departmentId?: string },
): Promise<TeacherDTO[]> {
  const filter: Record<string, unknown> = { role: 'faculty', active: true };
  if (query.departmentId) filter.departmentId = toObjectId(query.departmentId);
  if (query.q) {
    const rx = containsText(query.q);
    filter.$or = [{ name: rx }, { designation: rx }, { officeLocation: rx }];
  }
  const term = await currentTerm();
  const [teachers, org] = await Promise.all([
    User.find(filter).sort({ name: 1 }).limit(200).lean<UserDoc[]>(),
    getOrgLookup(),
  ]);
  const [offerings, allowed] = await Promise.all([
    CourseOffering.find({ termId: term._id, instructorId: { $in: teachers.map((t) => t._id) } })
      .select('code title sectionId instructorId')
      .lean<CourseOfferingDoc[]>(),
    messageableIds(viewer, teachers),
  ]);
  return teachers.map((t) => toTeacherDTO(t, org, offerings, allowed.has(String(t._id))));
}

/** Teachers keep their own office location and hours up to date. */
export async function updateOffice(user: UserDoc, input: OfficeInput): Promise<TeacherDTO> {
  if (user.role !== 'faculty') throw badRequest('Only teachers list office hours.');
  const data = parse(officeSchema, input);
  const updated = await User.findByIdAndUpdate(
    user._id,
    { $set: { officeLocation: data.officeLocation || null, officeHours: data.officeHours } },
    { returnDocument: 'after' },
  ).lean<UserDoc>();
  const term = await currentTerm();
  const [org, offerings] = await Promise.all([
    getOrgLookup(),
    CourseOffering.find({ termId: term._id, instructorId: user._id }).lean<CourseOfferingDoc[]>(),
  ]);
  return toTeacherDTO(updated ?? user, org, offerings, false);
}
