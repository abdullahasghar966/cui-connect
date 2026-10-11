/** Seeds the academic side of the demo campus (terms, rooms, catalog, programmes). */
import { randomBytes } from 'node:crypto';
import {
  type AssessmentType,
  ATTENDANCE_WARNING_MARGIN,
  type AttendanceStatus,
  addDays,
  allocateSeats,
  BLOCKING_CLASHES,
  campusClock,
  campusInstant,
  DEFAULT_MIN_ATTENDANCE,
  defaultTermDates,
  EXAM_SLOTS,
  findClashes,
  gradeFor,
  mondayOf,
  type SlotLike,
  seededOrder,
  semesterNumber,
  termIndex,
  termName,
  weekdayOf,
} from '@cui/shared';
import type { Types } from 'mongoose';
import {
  Assessment,
  type AssessmentDoc,
  AttendanceRecord,
  type AttendanceRecordDoc,
  AttendanceSession,
  type AttendanceSessionDoc,
  CatalogCourse,
  type CatalogCourseDoc,
  ClassSlot,
  type ClassSlotDoc,
  type CourseOfferingDoc,
  Exam,
  Mark,
  type MarkDoc,
  Program,
  type ProgramDoc,
  Result,
  type ResultDoc,
  Room,
  type RoomDoc,
  SeatAssignment,
  Section,
  type SectionDoc,
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

/** How well a student usually does (0.62–0.95), so their marks and grades look like one person's. */
function ability(regNo: string): number {
  if (regNo === 'FA23-BCS-003') return 0.63; // Ahmed: a C student (and short of attendance)
  if (regNo === 'FA23-BCS-002') return 0.84; // Hira: a strong student
  return 0.62 + roll(`ability:${regNo}`) * 0.0033;
}

/** A score out of `total` around the student's usual level, to the nearest half mark. */
function scoreFor(regNo: string, salt: string, total: number): number {
  const noise = (roll(`${regNo}:${salt}`) - 50) / 400; // ±0.125
  const share = Math.min(1, Math.max(0, ability(regNo) + noise));
  return Math.round(total * share * 2) / 2;
}

/** This term's assessments so far, by week of the term (later ones are left for teachers). */
const TERM_ASSESSMENTS: {
  type: AssessmentType;
  title: string;
  total: number;
  week: number;
  publish: boolean;
}[] = [
  { type: 'quiz', title: 'Quiz 1', total: 10, week: 2, publish: true },
  { type: 'assignment', title: 'Assignment 1', total: 20, week: 3, publish: true },
  { type: 'quiz', title: 'Quiz 2', total: 10, week: 4, publish: true },
  { type: 'sessional1', title: 'Sessional I', total: 25, week: 6, publish: true },
  // Marked but not yet published: the teacher's "Publish" demo.
  { type: 'quiz', title: 'Quiz 3', total: 10, week: 6, publish: false },
];

/** A failed course retaken the next term, to show the latest-attempt CGPA rule. */
const RETAKE = { regNo: 'FA23-BCS-003', code: 'CSC211', failedIn: 'FA24', passedIn: 'SP25' };

/**
 * Marks for this term's assessments that have already happened, and final results for every
 * earlier semester of each student's degree plan (their transcript and CGPA).
 */
export async function seedMarks(
  offerings: CourseOfferingDoc[],
  terms: Map<string, TermDoc>,
  currentTerm: TermDoc,
  today = campusClock().date,
): Promise<{ assessments: number; results: number }> {
  const students = await User.find({ role: 'student' })
    .select('regNo sectionId')
    .lean<{ _id: Types.ObjectId; regNo: string | null; sectionId: Types.ObjectId | null }[]>();
  const regNoOf = new Map(students.map((s) => [String(s._id), s.regNo ?? '']));

  // This term.
  const assessments: Omit<AssessmentDoc, '_id' | 'createdAt'>[] = [];
  for (const offering of offerings) {
    for (const plan of TERM_ASSESSMENTS) {
      const date = addDays(currentTerm.startsOn, plan.week * 7 - 3);
      if (date >= today) continue;
      assessments.push({
        offeringId: offering._id,
        type: plan.type,
        title: plan.title,
        total: plan.total,
        date,
        published: plan.publish,
        publishedAt: plan.publish ? campusInstant(addDays(date, 4), '12:00') : null,
        createdById: offering.instructorId,
      });
    }
  }
  const savedAssessments = await Assessment.insertMany(assessments);
  const offeringById = new Map(offerings.map((o) => [String(o._id), o]));
  const marks: Omit<MarkDoc, '_id' | 'updatedAt'>[] = [];
  for (const a of savedAssessments) {
    const offering = offeringById.get(String(a.offeringId));
    if (!offering) continue;
    for (const studentId of offering.studentIds) {
      const regNo = regNoOf.get(String(studentId)) ?? '';
      marks.push({
        assessmentId: a._id,
        offeringId: offering._id,
        studentId,
        obtained: scoreFor(regNo, `${offering.code}:${a.title}`, a.total),
        updatedById: offering.instructorId,
      });
    }
  }
  await Mark.insertMany(marks);

  // Earlier semesters: one result per course of the student's degree plan.
  const [sections, programs, catalog] = await Promise.all([
    Section.find().lean<SectionDoc[]>(),
    Program.find().lean<ProgramDoc[]>(),
    CatalogCourse.find().select('code title credits').lean<CatalogCourseDoc[]>(),
  ]);
  const sectionById = new Map(sections.map((s) => [String(s._id), s]));
  const programByCode = new Map(programs.map((p) => [p.code, p]));
  const courseByCode = new Map(catalog.map((c) => [c.code, c]));
  const results: Omit<ResultDoc, '_id' | 'createdAt'>[] = [];
  const addResult = (studentId: Types.ObjectId, term: TermDoc, code: string, percent: number) => {
    const course = courseByCode.get(code);
    if (!course) return;
    const band = gradeFor(percent);
    results.push({
      studentId,
      termId: term._id,
      offeringId: null,
      code,
      title: course.title,
      credits: course.credits,
      percent,
      grade: band.grade,
      points: band.points,
    });
  };
  for (const student of students) {
    const section = student.sectionId ? sectionById.get(String(student.sectionId)) : undefined;
    const program = section ? programByCode.get(section.program) : undefined;
    if (!section || !program || !student.regNo) continue;
    const current = semesterNumber(section.intake, currentTerm.code);
    for (const [code, term] of terms) {
      const semester = semesterNumber(section.intake, code);
      if (termIndex(code) < termIndex(section.intake) || semester >= current) continue;
      const plan = program.plan.find((p) => p.semester === semester);
      for (const course of plan?.courses ?? []) {
        let percent = scoreFor(student.regNo, `final:${course}`, 100);
        if (student.regNo === RETAKE.regNo && course === RETAKE.code) percent = 41;
        addResult(student._id, term, course, Math.max(percent, 35));
      }
    }
    if (student.regNo === RETAKE.regNo) {
      const passedIn = terms.get(RETAKE.passedIn);
      if (passedIn) addResult(student._id, passedIn, RETAKE.code, 66);
    }
  }
  await Result.insertMany(results);
  return { assessments: savedAssessments.length, results: results.length };
}

/**
 * Published date sheets with seats: Sessional I in week 6 (already sat) and Sessional II in week
 * 11 (coming up). Each course code is one paper for all its sections, placed in the first slot
 * where none of its students has another paper and enough exam rooms are free.
 */
export async function seedExams(offerings: CourseOfferingDoc[], term: TermDoc): Promise<number> {
  const [rooms, office] = await Promise.all([
    Room.find({ examRows: { $gt: 0 } })
      .sort({ name: 1 })
      .lean<RoomDoc[]>(),
    User.findOne({ role: 'staff', office: 'EXAM' }).select('_id').lean(),
  ]);
  if (!rooms.length || !office) return 0;
  const sections = new Map(
    (await Section.find().lean<SectionDoc[]>()).map((s) => [String(s._id), s.name]),
  );
  const byCode = new Map<string, CourseOfferingDoc[]>();
  for (const o of offerings) byCode.set(o.code, [...(byCode.get(o.code) ?? []), o]);
  const studentsOf = (list: CourseOfferingDoc[]) => [
    ...new Set(list.flatMap((o) => o.studentIds.map(String))),
  ];
  const codes = [...byCode.keys()].sort(
    (a, b) =>
      studentsOf(byCode.get(b) ?? []).length - studentsOf(byCode.get(a) ?? []).length ||
      a.localeCompare(b),
  );

  let created = 0;
  for (const [kind, week] of [
    ['sessional1', 6],
    ['sessional2', 11],
  ] as const) {
    const monday = mondayOf(addDays(term.startsOn, (week - 1) * 7));
    const slots = [0, 1, 2, 3, 4, 5].flatMap((d) =>
      EXAM_SLOTS.map(([start, end]) => ({ date: addDays(monday, d), start, end })),
    );
    const used = slots.map(() => ({ students: new Set<string>(), rooms: new Set<string>() }));
    for (const code of codes) {
      const list = byCode.get(code) ?? [];
      const students = studentsOf(list);
      const index = slots.findIndex((_, i) => {
        const slot = used[i];
        if (!slot || students.some((s) => slot.students.has(s))) return false;
        const free = rooms.filter((r) => !slot.rooms.has(String(r._id)));
        return free.reduce((n, r) => n + r.examRows * r.examCols, 0) >= students.length;
      });
      const slot = slots[index];
      const busy = used[index];
      if (!slot || !busy) throw new Error(`Seed exams: no slot left for ${code}`);
      const chosen: RoomDoc[] = [];
      for (const room of rooms) {
        if (busy.rooms.has(String(room._id))) continue;
        if (chosen.reduce((n, r) => n + r.examRows * r.examCols, 0) >= students.length) break;
        chosen.push(room);
      }
      for (const s of students) busy.students.add(s);
      for (const r of chosen) busy.rooms.add(String(r._id));

      const exam = await Exam.create({
        termId: term._id,
        kind,
        code,
        title: list[0]?.title ?? code,
        offeringIds: list.map((o) => o._id),
        ...slot,
        roomIds: chosen.map((r) => r._id),
        published: true,
        publishedAt: campusInstant(addDays(monday, -10), '10:00'),
        createdById: office._id,
      });
      const offeringOf = new Map<string, CourseOfferingDoc>();
      const candidates = list.flatMap((o) =>
        o.studentIds
          .filter((s) => !offeringOf.has(String(s)) && offeringOf.set(String(s), o))
          .map((s) => ({ id: String(s), group: sections.get(String(o.sectionId)) ?? '' })),
      );
      const { seats } = allocateSeats(
        seededOrder(candidates, `${code}:${kind}`, (c) => c.id),
        chosen.map((r) => ({ id: String(r._id), rows: r.examRows, cols: r.examCols })),
      );
      await SeatAssignment.insertMany(
        seats.map((s) => ({
          examId: exam._id,
          studentId: s.studentId,
          offeringId: offeringOf.get(s.studentId)?._id,
          roomId: s.roomId,
          row: s.row,
          seat: s.seat,
        })),
      );
      created++;
    }
  }
  return created;
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
