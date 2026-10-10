/** The course catalog (what each course is) and degree programmes (which courses, when). */
import {
  type CatalogCourseDTO,
  type CatalogCourseInput,
  type CsvImportResultDTO,
  canManageCatalog,
  catalogCourseSchema,
  type ProgramDTO,
  type ProgramInput,
  programSchema,
} from '@cui/shared';
import { readCsv } from '../lib/csv';
import { assertAllowed, badRequest, conflict, notFound, parse } from '../lib/errors';
import { containsText } from '../lib/text';
import {
  CatalogCourse,
  type CatalogCourseDoc,
  CourseOffering,
  type CourseOfferingDoc,
  Department,
  Program,
  type ProgramDoc,
  Section,
  type SectionDoc,
  type UserDoc,
} from '../models';
import { recordAudit } from './audit';
import { getOrgLookup, type Id, idOf, type OrgLookup, toPolicyUser } from './mappers';
import { currentTerm } from './terms';

export function toCatalogDTO(
  course: CatalogCourseDoc,
  org: OrgLookup,
  offeredSections = 0,
): CatalogCourseDTO {
  const departmentId = idOf(course.departmentId);
  return {
    code: course.code,
    title: course.title,
    departmentId,
    departmentCode: departmentId ? (org.departments.get(departmentId)?.code ?? null) : null,
    credits: course.credits,
    labCredits: course.labCredits,
    description: course.description,
    prerequisites: course.prerequisites,
    clos: course.clos.map(({ code, text }) => ({ code, text })),
    outline: course.outline.map(({ week, topic }) => ({ week, topic })),
    offeredSections,
  };
}

/** How many sections offer each course code in the current term. */
async function offeredCounts(): Promise<Map<string, number>> {
  const term = await currentTerm();
  const rows = await CourseOffering.aggregate<{ _id: string; n: number }>([
    { $match: { termId: term._id } },
    { $group: { _id: '$code', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.n]));
}

export async function listCatalog(query: {
  q: string;
  departmentId?: string;
}): Promise<CatalogCourseDTO[]> {
  const filter: Record<string, unknown> = {};
  if (query.departmentId) filter.departmentId = query.departmentId;
  if (query.q) {
    const rx = containsText(query.q);
    filter.$or = [{ code: rx }, { title: rx }];
  }
  const [courses, org, counts] = await Promise.all([
    CatalogCourse.find(filter).sort({ code: 1 }).limit(300).lean<CatalogCourseDoc[]>(),
    getOrgLookup(),
    offeredCounts(),
  ]);
  return courses.map((c) => toCatalogDTO(c, org, counts.get(c.code) ?? 0));
}

export async function getCatalogCourse(code: string): Promise<CatalogCourseDoc> {
  const course = await CatalogCourse.findOne({ code: code.toUpperCase() }).lean<CatalogCourseDoc>();
  if (!course) throw notFound(`${code.toUpperCase()} is not in the catalog.`);
  return course;
}

export async function saveCatalogCourse(
  actor: UserDoc,
  code: string,
  input: CatalogCourseInput,
): Promise<CatalogCourseDTO> {
  const data = parse(catalogCourseSchema, { ...input, code });
  const user = toPolicyUser(actor);
  const existing = await CatalogCourse.findOne({ code: data.code }).lean<CatalogCourseDoc>();
  // Editing a course needs rights over both its current and its new department.
  if (existing) assertAllowed(canManageCatalog(user, idOf(existing.departmentId)));
  assertAllowed(canManageCatalog(user, data.departmentId ?? null));
  if (data.prerequisites.includes(data.code)) {
    throw badRequest('A course cannot be its own prerequisite.');
  }
  const saved = await CatalogCourse.findOneAndUpdate(
    { code: data.code },
    {
      $set: {
        ...data,
        departmentId: data.departmentId ?? null,
        description: data.description ?? null,
      },
    },
    { upsert: true, returnDocument: 'after' },
  ).lean<CatalogCourseDoc>();
  if (!saved) throw new Error('Catalog save failed');
  void recordAudit({
    action: existing ? 'catalog.updated' : 'catalog.created',
    actor,
    summary: `${actor.name} ${existing ? 'updated' : 'added'} ${saved.code} ${saved.title} in the catalog`,
    targetType: 'course',
    targetId: saved._id,
  });
  const counts = await offeredCounts();
  return toCatalogDTO(saved, await getOrgLookup(), counts.get(saved.code) ?? 0);
}

export async function deleteCatalogCourse(actor: UserDoc, code: string): Promise<void> {
  const course = await getCatalogCourse(code);
  assertAllowed(canManageCatalog(toPolicyUser(actor), idOf(course.departmentId)));
  if (await CourseOffering.exists({ code: course.code })) {
    throw conflict(`${course.code} has course offerings. Remove those first.`);
  }
  await CatalogCourse.deleteOne({ _id: course._id });
  void recordAudit({
    action: 'catalog.deleted',
    actor,
    summary: `${actor.name} removed ${course.code} from the catalog`,
    targetType: 'course',
    targetId: course._id,
  });
}

export const CATALOG_CSV_COLUMNS = [
  'code',
  'title',
  'department',
  'credits',
  'labCredits',
  'prerequisites',
  'description',
] as const;

/** Adds or updates many catalog courses at once. Prerequisites are separated by spaces or `;`. */
export async function importCatalogCsv(actor: UserDoc, csv: string): Promise<CsvImportResultDTO> {
  let reader: ReturnType<typeof readCsv>;
  try {
    reader = readCsv(csv, ['code', 'title', 'credits']);
  } catch (err) {
    throw badRequest((err as Error).message);
  }
  const { rows, col } = reader;
  const departments = await Department.find().lean();
  const deptByCode = new Map(departments.map((d) => [d.code, String(d._id)]));
  const result: CsvImportResultDTO = { created: 0, errors: [] };
  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const deptCode = col(row, 'department').toUpperCase();
    if (deptCode && !deptByCode.has(deptCode)) {
      result.errors.push({ line, message: `Unknown department "${deptCode}"` });
      continue;
    }
    const parsed = catalogCourseSchema.safeParse({
      code: col(row, 'code'),
      title: col(row, 'title'),
      departmentId: deptCode ? deptByCode.get(deptCode) : null,
      credits: Number(col(row, 'credits')),
      labCredits: Number(col(row, 'labCredits') || 0),
      prerequisites: col(row, 'prerequisites')
        .split(/[\s;]+/)
        .filter(Boolean),
      description: col(row, 'description') || null,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      result.errors.push({
        line,
        message: `${issue?.path.join('.') || 'row'}: ${issue?.message ?? 'invalid'}`,
      });
      continue;
    }
    try {
      await saveCatalogCourse(actor, parsed.data.code, parsed.data);
      result.created++;
    } catch (err) {
      result.errors.push({ line, message: (err as Error).message });
    }
  }
  return result;
}

/**
 * Offerings created before the catalog existed get a catalog entry (3 credits by default), so
 * existing campuses keep working after the upgrade. Safe to run on every start.
 */
export async function ensureCatalogForOfferings(): Promise<number> {
  const [codes, known] = await Promise.all([
    CourseOffering.distinct('code'),
    CatalogCourse.distinct('code'),
  ]);
  const knownSet = new Set(known);
  const missing = codes.filter((code) => !knownSet.has(code));
  for (const code of missing) {
    const offering = await CourseOffering.findOne({ code }).lean<CourseOfferingDoc>();
    if (!offering) continue;
    const section = await Section.findById(offering.sectionId).lean<SectionDoc>();
    await ensureCatalogEntry(code, offering.title, section?.departmentId ?? null);
  }
  return missing.length;
}

/** Adds a 3-credit catalog entry for a new course code (never overwrites an existing one). */
export async function ensureCatalogEntry(
  code: string,
  title: string,
  departmentId: Id | null,
): Promise<void> {
  await CatalogCourse.updateOne(
    { code },
    { $setOnInsert: { code, title, departmentId, credits: 3, labCredits: 0 } },
    { upsert: true },
  );
}

// ---- Programmes ----

export function toProgramDTO(program: ProgramDoc, org: OrgLookup): ProgramDTO {
  const departmentId = String(program.departmentId);
  return {
    id: String(program._id),
    code: program.code,
    name: program.name,
    departmentId,
    departmentCode: org.departments.get(departmentId)?.code ?? null,
    totalCredits: program.totalCredits,
    plan: [...program.plan]
      .sort((a, b) => a.semester - b.semester)
      .map(({ semester, courses }) => ({ semester, courses: [...courses] })),
  };
}

export async function listPrograms(): Promise<ProgramDTO[]> {
  const [programs, org] = await Promise.all([
    Program.find().sort({ code: 1 }).lean<ProgramDoc[]>(),
    getOrgLookup(),
  ]);
  return programs.map((p) => toProgramDTO(p, org));
}

export async function saveProgram(
  actor: UserDoc,
  code: string,
  input: ProgramInput,
): Promise<ProgramDTO> {
  const data = parse(programSchema, { ...input, code });
  const user = toPolicyUser(actor);
  const existing = await Program.findOne({ code: data.code }).lean<ProgramDoc>();
  if (existing) assertAllowed(canManageCatalog(user, String(existing.departmentId)));
  assertAllowed(canManageCatalog(user, data.departmentId));
  const semesters = data.plan.map((p) => p.semester);
  if (new Set(semesters).size !== semesters.length) {
    throw badRequest('Each semester can appear only once in the plan.');
  }
  const saved = await Program.findOneAndUpdate(
    { code: data.code },
    { $set: data },
    { upsert: true, returnDocument: 'after' },
  ).lean<ProgramDoc>();
  if (!saved) throw new Error('Program save failed');
  void recordAudit({
    action: existing ? 'program.updated' : 'program.created',
    actor,
    summary: `${actor.name} ${existing ? 'updated' : 'added'} the ${saved.code} programme`,
    targetType: 'program',
    targetId: saved._id,
  });
  return toProgramDTO(saved, await getOrgLookup());
}

export async function deleteProgram(actor: UserDoc, code: string): Promise<void> {
  const program = await Program.findOne({ code: code.toUpperCase() }).lean<ProgramDoc>();
  if (!program) throw notFound('Programme not found.');
  assertAllowed(canManageCatalog(toPolicyUser(actor), String(program.departmentId)));
  await Program.deleteOne({ _id: program._id });
  void recordAudit({
    action: 'program.deleted',
    actor,
    summary: `${actor.name} removed the ${program.code} programme`,
    targetType: 'program',
    targetId: program._id,
  });
}
