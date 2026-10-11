/** Seeds the academic side of the demo campus (terms, rooms, catalog, programmes). */
import {
  BLOCKING_CLASHES,
  defaultTermDates,
  findClashes,
  type SlotLike,
  termName,
} from '@cui/shared';
import type { Types } from 'mongoose';
import {
  CatalogCourse,
  ClassSlot,
  type ClassSlotDoc,
  type CourseOfferingDoc,
  Program,
  Room,
  type RoomDoc,
  Term,
  type TermDoc,
} from '../models';
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

const LECTURE_TIMES: [string, string][] = [
  ['08:30', '10:00'],
  ['10:00', '11:30'],
  ['11:30', '13:00'],
  ['14:00', '15:30'],
  ['15:30', '17:00'],
];
const LAB_TIMES: [string, string][] = [
  ['08:30', '11:30'],
  ['11:30', '14:30'],
  ['14:00', '17:00'],
];
const TEACHING_DAYS = [1, 2, 3, 4, 5];

/**
 * A clash-free weekly timetable for the current offerings: two lectures a week on different
 * days, plus a three-hour lab for courses with lab credits. Placed greedily with the same clash
 * finder the timetable editor uses, so the demo can never contain a double booking.
 */
export async function seedTimetable(
  offerings: CourseOfferingDoc[],
  term: TermDoc,
): Promise<number> {
  const rooms = await Room.find().sort({ name: 1 }).lean<RoomDoc[]>();
  const classrooms = rooms.filter((r) => r.kind === 'classroom');
  const labs = rooms.filter((r) => r.kind === 'lab');
  const labCredits = new Map(CATALOG.map((c) => [c.code, c.lab ?? 0]));
  const placed: (SlotLike & { id: string })[] = [];
  const docs: Omit<ClassSlotDoc, '_id' | 'createdAt'>[] = [];

  const sorted = [...offerings].sort(
    (a, b) =>
      String(a.sectionId).localeCompare(String(b.sectionId)) || a.code.localeCompare(b.code),
  );
  for (const [index, offering] of sorted.entries()) {
    const project = offering.code === 'CSC498' || offering.code === 'CSC499';
    const sessions: ('lecture' | 'lab')[] = project ? ['lecture'] : ['lecture', 'lecture'];
    if (!project && (labCredits.get(offering.code) ?? 0) > 0) sessions.push('lab');
    const days = TEACHING_DAYS.map(
      (_, i) => TEACHING_DAYS[(i + index * 2) % TEACHING_DAYS.length] as number,
    );
    const usedDays = new Set<number>();

    for (const kind of sessions) {
      let done = false;
      for (const day of days) {
        if (done || usedDays.has(day)) continue;
        for (const [start, end] of kind === 'lab' ? LAB_TIMES : LECTURE_TIMES) {
          if (done) break;
          for (const room of kind === 'lab' ? labs : classrooms) {
            const candidate = {
              id: `${offering._id}:${placed.length}`,
              day,
              start,
              end,
              roomId: String(room._id),
              instructorId: String(offering.instructorId),
              sectionId: String(offering.sectionId),
              studentIds: offering.studentIds.map(String),
            };
            const blocked = findClashes(candidate, placed).some((c) =>
              BLOCKING_CLASHES.includes(c.kind),
            );
            if (blocked) continue;
            placed.push(candidate);
            docs.push({
              offeringId: offering._id,
              termId: term._id,
              sectionId: offering.sectionId,
              instructorId: offering.instructorId,
              roomId: room._id,
              day,
              start,
              end,
              kind,
            });
            usedDays.add(day);
            done = true;
            break;
          }
        }
      }
      if (!done) throw new Error(`Seed timetable: no room/time left for ${offering.code}`);
    }
  }
  await ClassSlot.insertMany(docs);
  return docs.length;
}
