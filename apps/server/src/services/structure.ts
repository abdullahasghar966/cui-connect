/** University structure: departments, sections and course offerings (admin only). */
import type {
  CourseDTO,
  CreateCourseInput,
  CreateDepartmentInput,
  CreateSectionInput,
  DepartmentDTO,
  PublicUserDTO,
  SectionDTO,
} from '@cui/shared';
import type { Types } from 'mongoose';
import { badRequest, conflict, isDuplicateKeyError, notFound } from '../lib/errors';
import {
  CourseOffering,
  type CourseOfferingDoc,
  Department,
  type DepartmentDoc,
  Group,
  Section,
  type SectionDoc,
  User,
  type UserDoc,
} from '../models';
import { recordAudit } from './audit';
import { ensureCatalogEntry } from './catalog';
import { getOrgLookup, idOf, invalidateOrgLookup, toObjectId, toPublicUserDTO } from './mappers';
import {
  groupKeys,
  provisionCourse,
  provisionDepartment,
  provisionSection,
  reconcileUser,
  reconcileUsers,
} from './provisioning';
import { currentTerm } from './terms';

async function requireFaculty(id: string | null | undefined, label: string) {
  if (!id) return null;
  const user = await User.findById(id).lean<UserDoc>();
  if (user?.role !== 'faculty' || !user.active) {
    throw badRequest(`${label} must be an active faculty member.`);
  }
  return user;
}

export async function listDepartments(): Promise<DepartmentDTO[]> {
  const [departments, counts] = await Promise.all([
    Department.find().sort({ code: 1 }).lean<DepartmentDoc[]>(),
    User.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { departmentId: { $ne: null } } },
      { $group: { _id: '$departmentId', n: { $sum: 1 } } },
    ]),
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  return departments.map((d) => ({
    id: String(d._id),
    code: d.code,
    name: d.name,
    userCount: byId.get(String(d._id)) ?? 0,
  }));
}

export async function createDepartment(
  actor: UserDoc | null,
  input: CreateDepartmentInput,
): Promise<DepartmentDoc> {
  let dept: DepartmentDoc;
  try {
    dept = (await Department.create(input)).toObject<DepartmentDoc>();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw conflict(`Department ${input.code} already exists.`);
    throw err;
  }
  await provisionDepartment(dept);
  invalidateOrgLookup();
  void recordAudit({
    action: 'department.created',
    actor,
    summary: `${actor?.name ?? 'System'} created department ${dept.code} (notices, faculty lounge and CR council provisioned)`,
    targetType: 'department',
    targetId: dept._id,
  });
  return dept;
}

export async function listSections(): Promise<SectionDTO[]> {
  const [sections, departments, counts] = await Promise.all([
    Section.find().sort({ name: 1 }).lean<SectionDoc[]>(),
    Department.find().lean<DepartmentDoc[]>(),
    User.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { role: 'student', sectionId: { $ne: null } } },
      { $group: { _id: '$sectionId', n: { $sum: 1 } } },
    ]),
  ]);
  const advisors = await User.find({
    _id: { $in: sections.map((s) => s.batchAdvisorId).filter(Boolean) },
  })
    .select('name')
    .lean<Pick<UserDoc, '_id' | 'name'>[]>();
  const advisorById = new Map(advisors.map((a) => [String(a._id), a]));
  const deptById = new Map(departments.map((d) => [String(d._id), d]));
  const countById = new Map(counts.map((c) => [String(c._id), c.n]));
  return sections.map((s) => {
    const advisor = s.batchAdvisorId ? advisorById.get(String(s.batchAdvisorId)) : undefined;
    return {
      id: String(s._id),
      name: s.name,
      program: s.program,
      intake: s.intake,
      departmentId: String(s.departmentId),
      departmentCode: deptById.get(String(s.departmentId))?.code ?? null,
      batchAdvisor: advisor ? { id: String(advisor._id), name: advisor.name } : null,
      studentCount: countById.get(String(s._id)) ?? 0,
    };
  });
}

export async function createSection(
  actor: UserDoc | null,
  input: CreateSectionInput,
): Promise<SectionDoc> {
  if (!(await Department.exists({ _id: input.departmentId }))) {
    throw badRequest('departmentId: department not found');
  }
  const advisor = await requireFaculty(input.batchAdvisorId, 'The batch advisor');
  let section: SectionDoc;
  try {
    section = (
      await Section.create({ ...input, batchAdvisorId: advisor?._id ?? null })
    ).toObject<SectionDoc>();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw conflict(`Section ${input.name} already exists.`);
    throw err;
  }
  await provisionSection(section);
  invalidateOrgLookup();
  if (advisor) await reconcileUser(advisor._id);
  void recordAudit({
    action: 'section.created',
    actor,
    summary: `${actor?.name ?? 'System'} created section ${section.name} and its class group`,
    targetType: 'section',
    targetId: section._id,
  });
  return section;
}

export async function setBatchAdvisor(
  actor: UserDoc | null,
  sectionId: string,
  batchAdvisorId: string | null,
): Promise<void> {
  const section = await Section.findById(sectionId).lean<SectionDoc>();
  if (!section) throw notFound('Section not found.');
  const advisor = await requireFaculty(batchAdvisorId, 'The batch advisor');
  await Section.updateOne({ _id: section._id }, { $set: { batchAdvisorId: advisor?._id ?? null } });
  const affected = [section.batchAdvisorId, advisor?._id].filter(
    (id): id is Types.ObjectId => !!id,
  );
  await reconcileUsers(affected);
  void recordAudit({
    action: 'section.advisor',
    actor,
    summary: `${actor?.name ?? 'System'} set the batch advisor of ${section.name} to ${advisor?.name ?? 'nobody'}`,
    targetType: 'section',
    targetId: section._id,
  });
}

/** Course offerings of the current term. */
export async function listCourses(): Promise<CourseDTO[]> {
  const term = await currentTerm();
  const [courses, sections, groups] = await Promise.all([
    CourseOffering.find({ termId: term._id }).sort({ code: 1 }).lean<CourseOfferingDoc[]>(),
    Section.find().lean<SectionDoc[]>(),
    Group.find({ type: 'COURSE' }).select('_id courseId').lean(),
  ]);
  const instructors = await User.find({ _id: { $in: courses.map((c) => c.instructorId) } })
    .select('name')
    .lean<Pick<UserDoc, '_id' | 'name'>[]>();
  const instructorById = new Map(instructors.map((i) => [String(i._id), i]));
  const sectionById = new Map(sections.map((s) => [String(s._id), s]));
  const groupByCourse = new Map(groups.map((g) => [String(g.courseId), String(g._id)]));
  return courses.map((c) => {
    const instructor = instructorById.get(String(c.instructorId));
    return {
      id: String(c._id),
      code: c.code,
      title: c.title,
      sectionId: String(c.sectionId),
      sectionName: sectionById.get(String(c.sectionId))?.name ?? null,
      instructor: instructor ? { id: String(instructor._id), name: instructor.name } : null,
      studentCount: c.studentIds.length,
      groupId: groupByCourse.get(String(c._id)) ?? null,
    };
  });
}

async function requireStudents(ids: string[]): Promise<Types.ObjectId[]> {
  const unique = [...new Set(ids)];
  const students = await User.find({ _id: { $in: unique }, role: 'student' })
    .select('_id')
    .lean();
  if (students.length !== unique.length) {
    throw badRequest('studentIds: every id must belong to an existing student.');
  }
  return students.map((s) => s._id);
}

export async function createCourse(
  actor: UserDoc | null,
  input: CreateCourseInput,
): Promise<CourseOfferingDoc> {
  const section = await Section.findById(input.sectionId).lean<SectionDoc>();
  if (!section) throw badRequest('sectionId: section not found');
  const instructor = await requireFaculty(input.instructorId, 'The instructor');
  const studentIds = input.studentIds
    ? await requireStudents(input.studentIds)
    : (
        await User.find({ sectionId: section._id, role: 'student', active: true })
          .select('_id')
          .lean()
      ).map((s) => s._id);

  const term = await currentTerm();
  let course: CourseOfferingDoc;
  try {
    course = (
      await CourseOffering.create({
        code: input.code,
        title: input.title,
        sectionId: section._id,
        instructorId: instructor?._id,
        studentIds,
        termId: term._id,
      })
    ).toObject<CourseOfferingDoc>();
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw conflict(`${input.code} is already offered to ${section.name} this term.`);
    }
    throw err;
  }
  await ensureCatalogEntry(course.code, course.title, section.departmentId);
  await provisionCourse(course, section);
  await reconcileUsers([course.instructorId, ...course.studentIds]);
  void recordAudit({
    action: 'course.created',
    actor,
    summary: `${actor?.name ?? 'System'} created ${course.code} ${course.title} for ${section.name} (${studentIds.length} students enrolled)`,
    targetType: 'course',
    targetId: course._id,
  });
  return course;
}

export async function enrollStudents(
  actor: UserDoc | null,
  courseId: string,
  studentIds: string[],
): Promise<void> {
  const course = await CourseOffering.findById(courseId).lean<CourseOfferingDoc>();
  if (!course) throw notFound('Course not found.');
  const ids = await requireStudents(studentIds);
  await CourseOffering.updateOne(
    { _id: course._id },
    { $addToSet: { studentIds: { $each: ids } } },
  );
  await reconcileUsers(ids);
  void recordAudit({
    action: 'course.enrolled',
    actor,
    summary: `${actor?.name ?? 'System'} enrolled ${ids.length} student(s) in ${course.code}`,
    targetType: 'course',
    targetId: course._id,
  });
}

export async function unenrollStudent(
  actor: UserDoc | null,
  courseId: string,
  studentId: string,
): Promise<void> {
  const course = await CourseOffering.findById(courseId).lean<CourseOfferingDoc>();
  if (!course) throw notFound('Course not found.');
  await CourseOffering.updateOne(
    { _id: course._id },
    { $pull: { studentIds: toObjectId(studentId) } },
  );
  await reconcileUser(studentId);
  const student = await User.findById(studentId).select('name').lean<Pick<UserDoc, 'name'>>();
  void recordAudit({
    action: 'course.unenrolled',
    actor,
    summary: `${actor?.name ?? 'System'} removed ${student?.name ?? 'a student'} from ${course.code}`,
    targetType: 'course',
    targetId: course._id,
  });
}

/** Students enrolled in a course offering, including repeaters from other sections. */
export async function listCourseStudents(courseId: string): Promise<PublicUserDTO[]> {
  const course = await CourseOffering.findById(courseId).lean<CourseOfferingDoc>();
  if (!course) throw notFound('Course not found.');
  const [students, org] = await Promise.all([
    User.find({ _id: { $in: course.studentIds } })
      .sort({ regNo: 1 })
      .lean<UserDoc[]>(),
    getOrgLookup(),
  ]);
  return students.map((s) => toPublicUserDTO(s, org));
}

/** Course group id for a course offering (used by tests and the admin UI). */
export async function courseGroupId(courseId: string): Promise<string | null> {
  const group = await Group.findOne({ key: groupKeys.course(courseId) })
    .select('_id')
    .lean();
  return idOf(group?._id);
}
