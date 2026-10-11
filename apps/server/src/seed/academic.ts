/** Seeds the academic side of the demo campus (terms, rooms, catalog, programmes). */
import { randomBytes } from 'node:crypto';
import {
  ATTENDANCE_WARNING_MARGIN,
  type AttendanceStatus,
  addDays,
  BLOCKING_CLASHES,
  campusClock,
  campusInstant,
  DEFAULT_MIN_ATTENDANCE,
  defaultTermDates,
  findClashes,
  type SlotLike,
  termName,
  weekdayOf,
} from '@cui/shared';
import type { Types } from 'mongoose';
import {
  AttendanceRecord,
  type AttendanceRecordDoc,
  AttendanceSession,
  type AttendanceSessionDoc,
  CatalogCourse,
  ClassSlot,
  type ClassSlotDoc,
  type CourseOfferingDoc,
  Program,
  Room,
  type RoomDoc,
  Term,
  type TermDoc,
  User,
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

/** A stable number from 0 to 99 for a piece of text, so reseeding gives the same demo data. */
function roll(text: string): number {
  let hash = 2166136261;
  for (const ch of text) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 100;
}

/** Students the demo shows in trouble in one course: below the minimum, or just above it. */
const ATTENDANCE_STORIES: Record<string, { course: string; state: 'short' | 'warning' }> = {
  'FA23-BCS-003': { course: 'CSC441', state: 'short' },
  'FA23-BCS-002': { course: 'CSC455', state: 'warning' },
};

/**
 * How many of `total` classes to miss to land in a state, whatever the date of the seed:
 * short = below the minimum; warning = at least the minimum but within the warning margin.
 */
function absencesFor(total: number, state: 'short' | 'warning'): number {
  // Whole-number percentages: 0.2 * 10 is 1.9999… in floating point.
  const minimum = DEFAULT_MIN_ATTENDANCE;
  const warnUntil = DEFAULT_MIN_ATTENDANCE + ATTENDANCE_WARNING_MARGIN;
  if (state === 'short') return Math.min(total, Math.floor((total * (100 - minimum)) / 100) + 1);
  // Fewest absences that drop below the warning line, if that still meets the minimum.
  const k = Math.floor((total * (100 - warnUntil)) / 100) + 1;
  return (total - k) * 100 >= minimum * total ? k : Math.floor((total * (100 - minimum)) / 100);
}

/**
 * Attendance for every class of the term that has already happened (closed sessions), mostly
 * present with a few late, absent and on-leave marks. Today's classes are left for the demo.
 */
export async function seedAttendance(
  offerings: CourseOfferingDoc[],
  term: TermDoc,
  today = campusClock().date,
): Promise<number> {
  const slots = await ClassSlot.find({ termId: term._id }).lean<ClassSlotDoc[]>();
  const students = await User.find({ role: 'student' })
    .select('regNo')
    .lean<{ _id: Types.ObjectId; regNo: string | null }[]>();
  const regNoOf = new Map(students.map((s) => [String(s._id), s.regNo ?? String(s._id)]));
  const sessions: Omit<AttendanceSessionDoc, '_id'>[] = [];
  const meetings: { offering: CourseOfferingDoc; date: string; start: string; index: number }[] =
    [];

  for (const offering of offerings) {
    const own = slots.filter((s) => String(s.offeringId) === String(offering._id));
    const dates: { date: string; slot: ClassSlotDoc }[] = [];
    for (let date = term.startsOn; date < today && date <= term.endsOn; date = addDays(date, 1)) {
      for (const slot of own) if (slot.day === weekdayOf(date)) dates.push({ date, slot });
    }
    dates.sort((a, b) => a.date.localeCompare(b.date) || a.slot.start.localeCompare(b.slot.start));
    for (const [index, { date, slot }] of dates.entries()) {
      const openedAt = campusInstant(date, slot.start);
      sessions.push({
        offeringId: offering._id,
        termId: term._id,
        slotId: slot._id,
        date,
        start: slot.start,
        secret: randomBytes(32).toString('base64url'),
        status: 'closed',
        openedById: offering.instructorId,
        openedAt,
        closedAt: new Date(openedAt.getTime() + 20 * 60_000),
      });
      meetings.push({ offering, date, start: slot.start, index });
    }
  }
  const saved = await AttendanceSession.insertMany(sessions);

  const totals = new Map<string, number>();
  for (const m of meetings) {
    const id = String(m.offering._id);
    totals.set(id, Math.max(totals.get(id) ?? 0, m.index + 1));
  }
  const records: Omit<AttendanceRecordDoc, '_id'>[] = [];
  for (const [i, meeting] of meetings.entries()) {
    const session = saved[i];
    if (!session) continue;
    const total = totals.get(String(meeting.offering._id)) ?? 1;
    for (const studentId of meeting.offering.studentIds) {
      const regNo = regNoOf.get(String(studentId)) ?? '';
      const story = ATTENDANCE_STORIES[regNo];
      let status: AttendanceStatus;
      if (story?.course === meeting.offering.code) {
        // Spread a fixed number of absences evenly across the term.
        const absences = absencesFor(total, story.state);
        const absentAt = new Set(
          Array.from({ length: absences }, (_, j) => Math.floor(((j + 0.5) * total) / absences)),
        );
        status = absentAt.has(meeting.index) ? 'absent' : 'present';
      } else {
        const r = roll(`${regNo}:${meeting.offering.code}:${meeting.date}:${meeting.start}`);
        status = r < 4 ? 'absent' : r < 9 ? 'late' : r < 10 ? 'leave' : 'present';
      }
      records.push({
        sessionId: session._id,
        offeringId: meeting.offering._id,
        studentId,
        status,
        method: status === 'absent' ? 'auto' : status === 'leave' ? 'manual' : 'qr',
        markedById: status === 'leave' ? meeting.offering.instructorId : studentId,
        markedAt: session.openedAt,
      });
    }
  }
  await AttendanceRecord.insertMany(records);
  return saved.length;
}
