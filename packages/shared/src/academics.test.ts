import { describe, expect, it } from 'vitest';
import {
  addDays,
  allocateSeats,
  attendanceOutlook,
  attendanceSummary,
  attendanceWindow,
  campusClock,
  campusInstant,
  cgpa,
  courseStanding,
  creditsEarned,
  DEFAULT_GRADING,
  eventsOverlap,
  findClashes,
  formatClock,
  formatCredits,
  gpa,
  gradeFor,
  gradeTargets,
  latestAttempts,
  type MarkedAssessment,
  mondayOf,
  nextTermCode,
  previousTermCode,
  semesterNumber,
  termCodeFor,
  termName,
  totalWeight,
  weekdayOf,
} from './academics';

describe('campus time', () => {
  it('reads the clock in Islamabad, not UTC', () => {
    // 20:30 UTC on a Sunday is 01:30 on Monday in Pakistan (UTC+5).
    const clock = campusClock(new Date('2026-10-11T20:30:00Z'));
    expect(clock).toEqual({ date: '2026-10-12', weekday: 1, minutes: 90 });
    expect(campusInstant('2026-10-12', '08:30').toISOString()).toBe('2026-10-12T03:30:00.000Z');
  });

  it('works with plain calendar dates', () => {
    expect(weekdayOf('2026-10-11')).toBe(7);
    expect(mondayOf('2026-10-15')).toBe('2026-10-12');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(formatClock('08:30')).toBe('8:30 AM');
    expect(formatClock('13:05')).toBe('1:05 PM');
    expect(formatClock('00:00')).toBe('12:00 AM');
  });
});

describe('terms and semesters', () => {
  it('maps dates to Fall (Aug–Jan) and Spring (Feb–Jul)', () => {
    expect(termCodeFor('2026-10-11')).toBe('FA26');
    expect(termCodeFor('2027-01-20')).toBe('FA26');
    expect(termCodeFor('2027-03-01')).toBe('SP27');
    expect(termName('FA26')).toBe('Fall 2026');
    expect(nextTermCode('FA26')).toBe('SP27');
    expect(previousTermCode('SP27')).toBe('FA26');
    expect(previousTermCode('FA26')).toBe('SP26');
  });

  it('counts the semester of a batch from its intake', () => {
    expect(semesterNumber('FA23', 'FA26')).toBe(7);
    expect(semesterNumber('FA24', 'FA26')).toBe(5);
    expect(semesterNumber('FA26', 'FA26')).toBe(1);
  });
});

describe('grades and GPA', () => {
  it('uses the grade boundaries', () => {
    expect(gradeFor(85).grade).toBe('A');
    expect(gradeFor(84.9).grade).toBe('A-');
    expect(gradeFor(71).grade).toBe('B');
    expect(gradeFor(50).grade).toBe('D');
    expect(gradeFor(49.99)).toMatchObject({ grade: 'F', points: 0 });
    expect(formatCredits(3, 1)).toBe('3(2,1)');
    expect(totalWeight(DEFAULT_GRADING)).toBe(100);
  });

  it('weights grade points by credit hours, counting an F as zero', () => {
    expect(gpa([])).toBeNull();
    expect(
      gpa([
        { credits: 3, points: 4 },
        { credits: 4, points: 3 },
        { credits: 3, points: 0 },
      ]),
    ).toBe(2.4);
  });

  it('projects a course total from the marks entered so far', () => {
    const marks: MarkedAssessment[] = [
      { type: 'quiz', total: 10, obtained: 8 },
      { type: 'quiz', total: 10, obtained: 6 },
      { type: 'assignment', total: 20, obtained: 20 },
      { type: 'sessional1', total: 25, obtained: 20 },
      { type: 'sessional2', total: 25, obtained: null },
      { type: 'terminal', total: 50, obtained: null },
    ];
    const standing = courseStanding(marks);
    // quizzes 70% of 15 = 10.5, assignments 100% of 10 = 10, sessional I 80% of 10 = 8.
    expect(standing.earned).toBe(28.5);
    expect(standing.completedWeight).toBe(35);
    expect(standing.remainingWeight).toBe(65);
    expect(standing.projectedPercent).toBe(81.4);
    expect(standing.finalPercent).toBeNull();

    const targets = gradeTargets(standing);
    expect(targets.find((t) => t.grade === 'A')).toEqual({
      grade: 'A',
      needed: 86.9,
      status: 'possible',
    });
    expect(targets.find((t) => t.grade === 'D')?.needed).toBe(33.1);
  });

  it('gives a final percentage once every component is marked', () => {
    const standing = courseStanding([
      { type: 'quiz', total: 10, obtained: 10 },
      { type: 'assignment', total: 10, obtained: 5 },
      { type: 'sessional1', total: 20, obtained: 10 },
      { type: 'sessional2', total: 20, obtained: 20 },
      { type: 'terminal', total: 50, obtained: 40 },
    ]);
    expect(standing.finalPercent).toBe(15 + 5 + 5 + 15 + 40);
    expect(gradeTargets(standing).find((t) => t.grade === 'A')?.status).toBe('out-of-reach');
    expect(gradeTargets(standing).find((t) => t.grade === 'A-')?.status).toBe('secured');
  });
});

describe('attendance', () => {
  it('excuses approved leave and warns near the minimum', () => {
    const present = Array<'present'>(8).fill('present');
    expect(attendanceSummary([...present, 'absent', 'absent'])).toMatchObject({
      held: 10,
      attended: 8,
      percent: 80,
      state: 'warning',
    });
    expect(attendanceSummary([...present, 'absent', 'absent', 'absent']).state).toBe('short');
    expect(attendanceSummary([...present, 'late', 'leave'])).toMatchObject({
      held: 9,
      attended: 9,
      leave: 1,
      percent: 100,
      state: 'ok',
    });
    expect(attendanceSummary([]).percent).toBeNull();
  });

  it('says how many classes a student can still miss, or must attend', () => {
    // 18 of 20 = 90%: two more absences give 18/22 = 81.8%, a third 18/23 = 78%.
    expect(attendanceOutlook({ held: 20, attended: 18 })).toEqual({ canMiss: 2, mustAttend: 0 });
    // Exactly at the minimum: no room left.
    expect(attendanceOutlook({ held: 10, attended: 8 })).toEqual({ canMiss: 0, mustAttend: 0 });
    // 6 of 10 = 60%: needs 10 in a row (16/20 = 80%).
    expect(attendanceOutlook({ held: 10, attended: 6 })).toEqual({ canMiss: 0, mustAttend: 10 });
    expect(attendanceOutlook({ held: 0, attended: 0 })).toEqual({ canMiss: 0, mustAttend: 0 });
    // 7 of 10 with a 75% rule: 8/11 = 72.7% is not enough, 9/12 = 75% is.
    expect(attendanceOutlook({ held: 10, attended: 7 }, 75)).toEqual({ canMiss: 0, mustAttend: 2 });
  });

  it('counts only the latest attempt of a repeated course in the CGPA', () => {
    const attempts = [
      { code: 'CSC211', term: 'FA24', credits: 4, points: 0 },
      { code: 'CSC211', term: 'FA25', credits: 4, points: 3 },
      { code: 'MTH104', term: 'FA23', credits: 3, points: 4 },
    ];
    expect(latestAttempts(attempts).map((a) => a.term)).toEqual(['FA25', 'FA23']);
    // (4 x 3 + 3 x 4) / 7 = 3.43; with the failed attempt it would have been 2.18.
    expect(cgpa(attempts)).toBe(3.43);
    expect(creditsEarned(attempts)).toBe(7);
    expect(creditsEarned([{ code: 'X', term: 'FA25', credits: 3, points: 0 }])).toBe(0);
    expect(cgpa([])).toBeNull();
  });

  it('numbers 10-second windows for the rotating QR code', () => {
    expect(attendanceWindow(new Date(0))).toBe(0);
    expect(attendanceWindow(new Date(9_999))).toBe(0);
    expect(attendanceWindow(new Date(10_000))).toBe(1);
  });
});

describe('timetable clashes', () => {
  const awt = {
    id: 'awt',
    day: 1,
    start: '08:30',
    end: '10:00',
    roomId: 'lab3',
    instructorId: 'imran',
    sectionId: '7A',
    studentIds: ['ali', 'hira'],
  };

  it('finds room, teacher and section clashes in overlapping times only', () => {
    const candidate = { ...awt, id: 'new', start: '09:30', end: '11:00' };
    expect(findClashes(candidate, [awt]).map((c) => c.kind)).toEqual([
      'room',
      'teacher',
      'section',
    ]);
    expect(findClashes({ ...candidate, start: '10:00', end: '11:30' }, [awt])).toEqual([]);
    expect(findClashes({ ...candidate, day: 2 }, [awt])).toEqual([]);
    expect(findClashes(awt, [awt])).toEqual([]); // editing the same slot
  });

  it('reports students shared with another section (repeaters) as a warning', () => {
    const cc7b = {
      id: 'cc',
      day: 1,
      start: '08:30',
      end: '10:00',
      roomId: 'cr2',
      instructorId: 'naveed',
      sectionId: '7B',
      studentIds: ['bilal', 'hira'],
    };
    expect(findClashes(awt, [cc7b])).toEqual([{ kind: 'students', slot: cc7b, students: 1 }]);
  });

  it('detects overlapping events on the same date', () => {
    const a = { date: '2026-10-20', start: '09:00', end: '11:00' };
    expect(eventsOverlap(a, { date: '2026-10-20', start: '10:30', end: '12:30' })).toBe(true);
    expect(eventsOverlap(a, { date: '2026-10-21', start: '10:30', end: '12:30' })).toBe(false);
  });
});

describe('exam seating', () => {
  it('mixes sections and fills rooms row by row', () => {
    const students = [
      { id: 'a1', group: 'A' },
      { id: 'a2', group: 'A' },
      { id: 'a3', group: 'A' },
      { id: 'b1', group: 'B' },
      { id: 'b2', group: 'B' },
    ];
    const { seats, unseated } = allocateSeats(students, [
      { id: 'hall', rows: 2, cols: 2 },
      { id: 'c12', rows: 1, cols: 3 },
    ]);
    expect(unseated).toBe(0);
    expect(seats.map((s) => s.studentId)).toEqual(['a1', 'b1', 'a2', 'b2', 'a3']);
    expect(seats[2]).toEqual({ studentId: 'a2', roomId: 'hall', row: 2, seat: 1 });
    expect(seats[4]).toEqual({ studentId: 'a3', roomId: 'c12', row: 1, seat: 1 });
  });

  it('reports students who do not fit', () => {
    const students = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, group: 'A' }));
    expect(allocateSeats(students, [{ id: 'r', rows: 2, cols: 2 }]).unseated).toBe(1);
  });
});
