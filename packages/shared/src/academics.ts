/**
 * University features: constants and pure calculations (time, terms, grades, attendance,
 * timetable clashes, exam seating). No I/O, so the server (the authority) and the web client
 * (instant previews) compute exactly the same numbers, and every rule is unit-tested.
 */

// ---- Campus time ----

/** COMSATS Islamabad. Pakistan has no daylight saving, so the offset is fixed. */
export const CAMPUS_TIMEZONE = 'Asia/Karachi';
export const CAMPUS_UTC_OFFSET = '+05:00';

/** ISO weekdays used by the timetable: 1 = Monday … 6 = Saturday. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

/** Common class start times on campus, offered as presets in the timetable editor. */
export const SLOT_PRESETS = ['08:30', '10:00', '11:30', '13:00', '14:30', '16:00'] as const;

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const clockFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAMPUS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface CampusClock {
  /** Calendar date on campus, `YYYY-MM-DD`. */
  date: string;
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** Minutes since midnight on campus. */
  minutes: number;
}

/** What the clock on the wall in Islamabad says (the server itself runs on UTC). */
export function campusClock(at: Date = new Date()): CampusClock {
  const parts = Object.fromEntries(clockFormat.formatToParts(at).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    date,
    weekday: weekdayOf(date),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** `'08:30'` → 510. */
export function toMinutes(time: string): number {
  const [h = '0', m = '0'] = time.split(':');
  return Number(h) * 60 + Number(m);
}

/** 510 → `'08:30'`. */
export function fromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** `'13:05'` → `'1:05 PM'`, the way times are written on campus notices. */
export function formatClock(time: string): string {
  const minutes = toMinutes(time);
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, '0');
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${((h + 11) % 12) + 1}:${m} ${suffix}`;
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatClock(start)} – ${formatClock(end)}`;
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a `YYYY-MM-DD` date. */
export function weekdayOf(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Monday of the week containing `date`. */
export function mondayOf(date: string): string {
  return addDays(date, 1 - weekdayOf(date));
}

/** The exact instant of a campus date and time, e.g. for countdowns and reminders. */
export function campusInstant(date: string, time = '00:00'): Date {
  return new Date(`${date}T${time}:00${CAMPUS_UTC_OFFSET}`);
}

export const ROOM_KINDS = ['classroom', 'lab', 'hall'] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];

export const ROOM_KIND_LABELS: Record<RoomKind, string> = {
  classroom: 'Classroom',
  lab: 'Lab',
  hall: 'Exam hall',
};

export const CLASS_KINDS = ['lecture', 'lab'] as const;
export type ClassKind = (typeof CLASS_KINDS)[number];

// ---- Terms (semesters) ----

export const TERM_PATTERN = /^(FA|SP)\d{2}$/;

/** Fall runs from August to January, Spring from February to July. */
export function termCodeFor(date: string): string {
  const month = Number(date.slice(5, 7));
  const year = Number(date.slice(2, 4));
  if (month >= 8) return `FA${String(year).padStart(2, '0')}`;
  if (month === 1) return `FA${String((year + 99) % 100).padStart(2, '0')}`;
  return `SP${String(year).padStart(2, '0')}`;
}

/** `'FA26'` → `'Fall 2026'`. */
export function termName(code: string): string {
  return `${code.startsWith('FA') ? 'Fall' : 'Spring'} 20${code.slice(2)}`;
}

/** A sortable number: SP26 < FA26 < SP27. */
export function termIndex(code: string): number {
  return Number(code.slice(2)) * 2 + (code.startsWith('FA') ? 1 : 0);
}

function termFromIndex(index: number): string {
  const year = String(Math.floor(index / 2)).padStart(2, '0');
  return `${index % 2 ? 'FA' : 'SP'}${year}`;
}

export const nextTermCode = (code: string) => termFromIndex(termIndex(code) + 1);
export const previousTermCode = (code: string) => termFromIndex(termIndex(code) - 1);

/** Default teaching dates of a term, used when IT creates a term without editing them. */
export function defaultTermDates(code: string): { startsOn: string; endsOn: string } {
  const year = 2000 + Number(code.slice(2));
  return code.startsWith('FA')
    ? { startsOn: `${year}-09-01`, endsOn: `${year + 1}-01-31` }
    : { startsOn: `${year}-02-15`, endsOn: `${year}-07-15` };
}

/** Which semester a batch is in: intake FA23 is in its 7th semester during FA26. */
export function semesterNumber(intake: string, term: string): number {
  return Math.max(1, termIndex(term) - termIndex(intake) + 1);
}

// ---- Credits and grading ----

/** COMSATS style: `3(2,1)` = 3 credit hours, 2 theory and 1 lab. */
export function formatCredits(credits: number, labCredits = 0): string {
  return `${credits}(${credits - labCredits},${labCredits})`;
}

export const ASSESSMENT_TYPES = [
  'quiz',
  'assignment',
  'sessional1',
  'sessional2',
  'terminal',
  'lab',
  'project',
] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const ASSESSMENT_LABELS: Record<AssessmentType, string> = {
  quiz: 'Quizzes',
  assignment: 'Assignments',
  sessional1: 'Sessional I',
  sessional2: 'Sessional II',
  terminal: 'Terminal exam',
  lab: 'Lab work',
  project: 'Project',
};

/** Percent of the final grade each kind of assessment carries. */
export type GradingWeights = Record<AssessmentType, number>;

/** COMSATS-style default; each course can change it (the weights must add up to 100). */
export const DEFAULT_GRADING: GradingWeights = {
  quiz: 15,
  assignment: 10,
  sessional1: 10,
  sessional2: 15,
  terminal: 50,
  lab: 0,
  project: 0,
};

export const totalWeight = (weights: GradingWeights) =>
  ASSESSMENT_TYPES.reduce((sum, type) => sum + (weights[type] ?? 0), 0);

export interface GradeBand {
  grade: string;
  /** Lowest percentage that earns this grade. */
  min: number;
  points: number;
}

/** COMSATS-style absolute grading scale. */
export const GRADE_SCALE: readonly GradeBand[] = [
  { grade: 'A', min: 85, points: 4 },
  { grade: 'A-', min: 80, points: 3.66 },
  { grade: 'B+', min: 75, points: 3.33 },
  { grade: 'B', min: 71, points: 3 },
  { grade: 'B-', min: 68, points: 2.66 },
  { grade: 'C+', min: 64, points: 2.33 },
  { grade: 'C', min: 61, points: 2 },
  { grade: 'C-', min: 58, points: 1.66 },
  { grade: 'D+', min: 54, points: 1.33 },
  { grade: 'D', min: 50, points: 1 },
  { grade: 'F', min: 0, points: 0 },
];

export const PASS_MIN = 50;

export const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function gradeFor(percent: number): GradeBand {
  return GRADE_SCALE.find((band) => percent >= band.min) ?? (GRADE_SCALE.at(-1) as GradeBand);
}

/** Credit-weighted grade point average; F counts as 0 points. Null when there's nothing yet. */
export function gpa(courses: readonly { credits: number; points: number }[]): number | null {
  const credits = courses.reduce((sum, c) => sum + c.credits, 0);
  if (!credits) return null;
  return round(courses.reduce((sum, c) => sum + c.points * c.credits, 0) / credits);
}

export interface MarkedAssessment {
  type: AssessmentType;
  total: number;
  /** Null until the teacher enters a mark. Absent students get 0. */
  obtained: number | null;
}

export interface TypeStanding {
  type: AssessmentType;
  weight: number;
  /** Average fraction (0–1) over the marked assessments of this type; null when none yet. */
  average: number | null;
  /** Weighted points earned (out of `weight`). */
  earned: number | null;
  marked: number;
}

export interface CourseStanding {
  byType: TypeStanding[];
  /** Points earned so far, out of 100. */
  earned: number;
  /** Weight of the components that have at least one mark. */
  completedWeight: number;
  remainingWeight: number;
  /** Earned as a percentage of what has been assessed so far. */
  projectedPercent: number | null;
  /** Set once every weighted component has marks. */
  finalPercent: number | null;
}

/**
 * Within a component, assessments count equally (e.g. four quizzes share the 15%). A component
 * counts as completed as soon as one of its assessments is marked.
 */
export function courseStanding(
  assessments: readonly MarkedAssessment[],
  weights: GradingWeights = DEFAULT_GRADING,
): CourseStanding {
  const byType: TypeStanding[] = [];
  let earned = 0;
  let completedWeight = 0;
  let remainingWeight = 0;
  for (const type of ASSESSMENT_TYPES) {
    const weight = weights[type] ?? 0;
    if (weight <= 0) continue;
    const marked = assessments.filter((a) => a.type === type && a.obtained !== null && a.total > 0);
    if (!marked.length) {
      remainingWeight += weight;
      byType.push({ type, weight, average: null, earned: null, marked: 0 });
      continue;
    }
    const average =
      marked.reduce((sum, a) => sum + Math.min(1, Math.max(0, (a.obtained ?? 0) / a.total)), 0) /
      marked.length;
    const points = weight * average;
    earned += points;
    completedWeight += weight;
    byType.push({ type, weight, average, earned: round(points), marked: marked.length });
  }
  return {
    byType,
    earned: round(earned),
    completedWeight,
    remainingWeight,
    projectedPercent: completedWeight ? round((earned / completedWeight) * 100, 1) : null,
    finalPercent: completedWeight && !remainingWeight ? round(earned, 1) : null,
  };
}

export interface GradeTarget {
  grade: string;
  /** Percentage needed on everything not yet marked; null once marking is complete. */
  needed: number | null;
  status: 'secured' | 'possible' | 'out-of-reach';
}

/** "What do I need?": the score needed on the remaining work to reach each grade. */
export function gradeTargets(standing: CourseStanding): GradeTarget[] {
  return GRADE_SCALE.filter((band) => band.min > 0).map((band) => {
    if (standing.earned >= band.min) return { grade: band.grade, needed: 0, status: 'secured' };
    if (!standing.remainingWeight) {
      return { grade: band.grade, needed: null, status: 'out-of-reach' };
    }
    const needed = round(((band.min - standing.earned) / standing.remainingWeight) * 100, 1);
    return {
      grade: band.grade,
      needed,
      status: needed <= 100 ? 'possible' : 'out-of-reach',
    };
  });
}

// ---- Attendance ----

export const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'leave'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  leave: 'On leave',
};

/** Below this, students can't sit the terminal exam. IT can change it in campus settings. */
export const DEFAULT_MIN_ATTENDANCE = 80;
/** How close to the minimum counts as a warning. */
export const ATTENDANCE_WARNING_MARGIN = 5;

export interface AttendanceSummary {
  /** Classes that count (approved leave is excused). */
  held: number;
  attended: number;
  absent: number;
  leave: number;
  percent: number | null;
  state: 'ok' | 'warning' | 'short';
}

export function attendanceSummary(
  statuses: readonly AttendanceStatus[],
  minimum = DEFAULT_MIN_ATTENDANCE,
): AttendanceSummary {
  const leave = statuses.filter((s) => s === 'leave').length;
  const attended = statuses.filter((s) => s === 'present' || s === 'late').length;
  const held = statuses.length - leave;
  const percent = held ? round((attended / held) * 100, 1) : null;
  const state =
    percent === null || percent >= minimum + ATTENDANCE_WARNING_MARGIN
      ? 'ok'
      : percent < minimum
        ? 'short'
        : 'warning';
  return { held, attended, absent: held - attended, leave, percent, state };
}

// ---- Timetable clashes ----

export interface SlotLike {
  id?: string;
  day: number;
  start: string;
  end: string;
  roomId?: string | null;
  instructorId?: string | null;
  sectionId?: string | null;
  studentIds?: readonly string[];
}

export type ClashKind = 'room' | 'teacher' | 'section' | 'students';

/** Room, teacher and section clashes are refused; shared students (repeaters) only warn. */
export const BLOCKING_CLASHES: readonly ClashKind[] = ['room', 'teacher', 'section'];

export interface Clash<T extends SlotLike = SlotLike> {
  kind: ClashKind;
  slot: T;
  /** For `students`: how many students would be in two places at once. */
  students?: number;
}

export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

export function findClashes<T extends SlotLike>(
  candidate: SlotLike,
  existing: readonly T[],
): Clash<T>[] {
  const clashes: Clash<T>[] = [];
  const students = new Set(candidate.studentIds ?? []);
  for (const slot of existing) {
    if (candidate.id && slot.id === candidate.id) continue;
    if (slot.day !== candidate.day) continue;
    if (!timesOverlap(candidate.start, candidate.end, slot.start, slot.end)) continue;
    if (candidate.roomId && slot.roomId === candidate.roomId) clashes.push({ kind: 'room', slot });
    if (candidate.instructorId && slot.instructorId === candidate.instructorId) {
      clashes.push({ kind: 'teacher', slot });
    }
    if (candidate.sectionId && slot.sectionId === candidate.sectionId) {
      clashes.push({ kind: 'section', slot });
    } else if (students.size && slot.studentIds?.length) {
      const shared = slot.studentIds.filter((id) => students.has(id)).length;
      if (shared) clashes.push({ kind: 'students', slot, students: shared });
    }
  }
  return clashes;
}

// ---- Exam seating ----

export interface SeatRoom {
  id: string;
  rows: number;
  cols: number;
}

export interface SeatCandidate {
  id: string;
  /** Usually the section: neighbours come from different sections where possible. */
  group: string;
}

export interface Seat {
  studentId: string;
  roomId: string;
  row: number;
  seat: number;
}

/** Round-robin across groups, so classmates don't sit next to each other. */
export function interleaveByGroup<T extends SeatCandidate>(candidates: readonly T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const c of candidates) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  const queues = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, q]) => q);
  const out: T[] = [];
  for (let i = 0; out.length < candidates.length; i++) {
    for (const queue of queues) {
      const next = queue[i];
      if (next) out.push(next);
    }
  }
  return out;
}

/** Fills the rooms in order, row by row. Returns who couldn't be seated if rooms are too small. */
export function allocateSeats(
  candidates: readonly SeatCandidate[],
  rooms: readonly SeatRoom[],
): { seats: Seat[]; unseated: number } {
  const positions = rooms.flatMap((room) =>
    Array.from({ length: room.rows * room.cols }, (_, i) => ({
      roomId: room.id,
      row: Math.floor(i / room.cols) + 1,
      seat: (i % room.cols) + 1,
    })),
  );
  const ordered = interleaveByGroup(candidates);
  const seats = ordered.slice(0, positions.length).map((c, i) => ({
    studentId: c.id,
    ...(positions[i] as Omit<Seat, 'studentId'>),
  }));
  return { seats, unseated: Math.max(0, ordered.length - positions.length) };
}

/** Two timed events on the same date overlap (e.g. a student's exams). */
export function eventsOverlap(
  a: { date: string; start: string; end: string },
  b: { date: string; start: string; end: string },
): boolean {
  return a.date === b.date && timesOverlap(a.start, a.end, b.start, b.end);
}
