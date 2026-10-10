/** Seeds the academic side of the demo campus (terms, rooms, catalog, programmes). */
import { defaultTermDates, termName } from '@cui/shared';
import type { Types } from 'mongoose';
import { CatalogCourse, Program, Room, Term, type TermDoc } from '../models';
import { CATALOG, PROGRAMS, ROOMS, SEED_CURRENT_TERM, SEED_TERMS } from './academic-data';
import type { DeptCode } from './data';

export interface AcademicSeed {
  terms: Map<string, TermDoc>;
  currentTerm: TermDoc;
}

export async function seedAcademicStructure(
  deptId: (code: DeptCode) => Types.ObjectId,
): Promise<AcademicSeed> {
  const terms = await Term.insertMany(
    SEED_TERMS.map((code) => ({
      code,
      name: termName(code),
      ...defaultTermDates(code),
      current: code === SEED_CURRENT_TERM,
    })),
  );
  const byCode = new Map(terms.map((t) => [t.code, t.toObject<TermDoc>()]));
  const currentTerm = byCode.get(SEED_CURRENT_TERM);
  if (!currentTerm) throw new Error('Seed data error: missing current term');

  await Room.insertMany(ROOMS.map((r) => ({ examRows: 0, examCols: 0, ...r })));
  await CatalogCourse.insertMany(
    CATALOG.map((c) => ({
      code: c.code,
      title: c.title,
      departmentId: deptId(c.dept),
      credits: c.credits,
      labCredits: c.lab ?? 0,
      description: c.description ?? null,
      prerequisites: c.prerequisites ?? [],
      clos: (c.clos ?? []).map((text, i) => ({ code: `CLO${i + 1}`, text })),
      outline: (c.outline ?? []).map((topic, i) => ({ week: i + 1, topic })),
    })),
  );
  await Program.insertMany(
    PROGRAMS.map((p) => ({
      code: p.code,
      name: p.name,
      departmentId: deptId(p.dept),
      totalCredits: p.totalCredits,
      plan: p.plan
        .map((courses, i) => ({ semester: i + 1, courses }))
        .filter((s) => s.courses.length),
    })),
  );
  return { terms: byCode, currentTerm };
}
