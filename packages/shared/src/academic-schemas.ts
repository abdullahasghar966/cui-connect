/** Zod schemas for the university features, shared by the REST API and the web forms. */
import { z } from 'zod';
import {
  ASSESSMENT_TYPES,
  ATTENDANCE_STATUSES,
  CALENDAR_KINDS,
  CLASS_KINDS,
  DATE_PATTERN,
  EXAM_KINDS,
  ROOM_KINDS,
  TERM_PATTERN,
  TIME_PATTERN,
  toMinutes,
} from './academics';
import { MAX_FILES_PER_ITEM, QUIZ_LIMITS } from './coursework';
import { objectIdSchema } from './schemas';

export const courseCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}\d{3}$/, 'Course code like CSC337');

export const dateSchema = z.string().regex(DATE_PATTERN, 'Use a date like 2026-09-01');

export const termCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(TERM_PATTERN, 'Term code like FA26 or SP27');

export const createTermSchema = z
  .object({ code: termCodeSchema, startsOn: dateSchema, endsOn: dateSchema })
  .refine((t) => t.startsOn < t.endsOn, {
    message: 'The term must end after it starts',
    path: ['endsOn'],
  });

export const roomSchema = z.object({
  name: z.string().trim().min(1).max(40),
  block: z.string().trim().min(1).max(60),
  floor: z.number().int().min(-2).max(30).nullable().default(null),
  kind: z.enum(ROOM_KINDS),
  capacity: z.number().int().min(1).max(2000),
  examRows: z.number().int().min(0).max(80).default(0),
  examCols: z.number().int().min(0).max(60).default(0),
});

export const catalogCourseSchema = z
  .object({
    code: courseCodeSchema,
    title: z.string().trim().min(3).max(100),
    departmentId: objectIdSchema.nullish(),
    credits: z.number().int().min(1).max(6),
    labCredits: z.number().int().min(0).max(3).default(0),
    description: z.string().trim().max(2000).nullish(),
    prerequisites: z.array(courseCodeSchema).max(10).default([]),
    clos: z
      .array(
        z.object({
          code: z.string().trim().min(1).max(10),
          text: z.string().trim().min(3).max(300),
        }),
      )
      .max(20)
      .default([]),
    outline: z
      .array(
        z.object({
          week: z.number().int().min(1).max(20),
          topic: z.string().trim().min(2).max(200),
        }),
      )
      .max(20)
      .default([]),
  })
  .refine((c) => c.labCredits <= c.credits, {
    message: 'Lab credits cannot exceed the total',
    path: ['labCredits'],
  });

export const catalogCsvSchema = z.object({ csv: z.string().min(1).max(200_000) });

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(80).default(''),
  departmentId: objectIdSchema.optional(),
  /** `1`: only courses that some section takes this term. */
  offered: z
    .enum(['0', '1'])
    .optional()
    .transform((value) => value === '1'),
});

export const programSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,5}$/, 'Program code like BCS'),
  name: z.string().trim().min(3).max(120),
  departmentId: objectIdSchema,
  totalCredits: z.number().int().min(1).max(250),
  plan: z
    .array(
      z.object({
        semester: z.number().int().min(1).max(12),
        courses: z.array(courseCodeSchema).max(12),
      }),
    )
    .max(12)
    .default([]),
});

// ---- Timetable ----

export const timeSchema = z.string().regex(TIME_PATTERN, 'Use a 24-hour time like 08:30');

const minutesBetween = (start: string, end: string) => toMinutes(end) - toMinutes(start);

export const classSlotSchema = z
  .object({
    offeringId: objectIdSchema,
    day: z.number().int().min(1).max(6),
    start: timeSchema,
    end: timeSchema,
    roomId: objectIdSchema.nullable(),
    kind: z.enum(CLASS_KINDS).default('lecture'),
  })
  .refine((s) => minutesBetween(s.start, s.end) >= 30, {
    message: 'A class must last at least 30 minutes and end after it starts',
    path: ['end'],
  })
  .refine((s) => minutesBetween(s.start, s.end) <= 240, {
    message: 'A class can last at most 4 hours',
    path: ['end'],
  })
  .refine((s) => toMinutes(s.start) >= 7 * 60 && toMinutes(s.end) <= 20 * 60, {
    message: 'Classes run between 7:00 AM and 8:00 PM',
    path: ['start'],
  });

export const classChangeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('cancelled'),
    date: dateSchema,
    note: z.string().trim().max(200).optional(),
  }),
  z
    .object({
      kind: z.literal('moved'),
      date: dateSchema,
      newDate: dateSchema,
      newStart: timeSchema,
      newEnd: timeSchema,
      newRoomId: objectIdSchema.nullable(),
      note: z.string().trim().max(200).optional(),
    })
    .refine((c) => minutesBetween(c.newStart, c.newEnd) >= 30, {
      message: 'The class must end at least 30 minutes after it starts',
      path: ['newEnd'],
    }),
]);

export const TIMETABLE_VIEWS = ['me', 'section', 'teacher', 'room'] as const;
export type TimetableView = (typeof TIMETABLE_VIEWS)[number];

export const timetableQuerySchema = z.object({
  view: z.enum(TIMETABLE_VIEWS).default('me'),
  id: objectIdSchema.optional(),
  /** Any date in the week to show (defaults to this week). */
  week: dateSchema.optional(),
});

// ---- Attendance ----

export const startAttendanceSchema = z.object({
  offeringId: objectIdSchema,
  /** Defaults to today on campus; earlier dates record a class that already happened. */
  date: dateSchema.optional(),
  slotId: objectIdSchema.optional(),
});

export const checkInSchema = z.object({
  sessionId: objectIdSchema,
  token: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{8,64}$/, 'That code is not valid. Scan the code on the screen again.'),
});

export const markAttendanceSchema = z.object({
  /** Null clears the mark. */
  status: z.enum(ATTENDANCE_STATUSES).nullable(),
});

// ---- Marks ----

export const assessmentSchema = z.object({
  type: z.enum(ASSESSMENT_TYPES),
  title: z.string().trim().min(2, 'Give the assessment a title').max(60),
  total: z.number().positive('Total marks must be more than 0').max(500),
  date: dateSchema.nullish(),
});

const mark = z
  .number()
  .min(0, 'Marks cannot be negative')
  .max(500)
  .transform((value) => Math.round(value * 100) / 100);

export const marksSchema = z.object({
  marks: z
    .array(z.object({ studentId: objectIdSchema, obtained: mark.nullable() }))
    .min(1)
    .max(500),
});

const weight = z.number().int().min(0).max(100);

export const gradingWeightsSchema = z
  .object({
    quiz: weight,
    assignment: weight,
    sessional1: weight,
    sessional2: weight,
    terminal: weight,
    lab: weight,
    project: weight,
  })
  .refine((w) => Object.values(w).reduce((sum, v) => sum + v, 0) === 100, {
    message: 'The weights must add up to 100',
  });

/** `null` goes back to the campus default. */
export const courseGradingSchema = z.object({ weights: gradingWeightsSchema.nullable() });

export const officeSchema = z.object({
  officeLocation: z.string().trim().max(120).nullable(),
  officeHours: z
    .array(
      z
        .object({ day: z.number().int().min(1).max(6), start: timeSchema, end: timeSchema })
        .refine((h) => minutesBetween(h.start, h.end) >= 15, {
          message: 'Office hours must end at least 15 minutes after they start',
        }),
    )
    .max(12),
});

export const searchQuerySchema = z.object({ q: z.string().trim().min(2).max(80) });

/** Whose record to open (default: your own). */
export const studentRecordQuerySchema = z.object({ studentId: objectIdSchema.optional() });

export const recordStudentsQuerySchema = z.object({ q: z.string().trim().max(80).default('') });

export const teacherDirectoryQuerySchema = z.object({
  q: z.string().trim().max(80).default(''),
  departmentId: objectIdSchema.optional(),
});

export const calendarEventSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the date a title').max(120),
    kind: z.enum(CALENDAR_KINDS),
    startsOn: dateSchema,
    endsOn: dateSchema,
    description: z.string().trim().max(500).nullish(),
  })
  .refine((e) => e.startsOn <= e.endsOn, {
    message: 'The end date must be on or after the start date',
    path: ['endsOn'],
  });

export const calendarQuerySchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((q) => q.from <= q.to, { message: 'from must be before to', path: ['to'] })
  .refine((q) => (new Date(q.to).getTime() - new Date(q.from).getTime()) / 86_400_000 <= 93, {
    message: 'Ask for at most three months at a time',
    path: ['to'],
  });

/** The academic calendar can be listed a whole year at a time. */
export const academicCalendarQuerySchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((q) => q.from <= q.to, { message: 'from must be before to', path: ['to'] })
  .refine((q) => (new Date(q.to).getTime() - new Date(q.from).getTime()) / 86_400_000 <= 400, {
    message: 'Ask for at most a year at a time',
    path: ['to'],
  });

export const roomFinderQuerySchema = z.object({
  date: dateSchema.optional(),
  time: timeSchema.optional(),
});

// ---- Exams ----

export const examSchema = z
  .object({
    kind: z.enum(EXAM_KINDS),
    code: courseCodeSchema,
    offeringIds: z.array(objectIdSchema).min(1, 'Choose at least one section').max(20),
    date: dateSchema,
    start: timeSchema,
    end: timeSchema,
    roomIds: z.array(objectIdSchema).max(20).default([]),
  })
  .refine((e) => minutesBetween(e.start, e.end) >= 30, {
    message: 'A paper must last at least 30 minutes and end after it starts',
    path: ['end'],
  })
  .refine((e) => minutesBetween(e.start, e.end) <= 240, {
    message: 'A paper can last at most 4 hours',
    path: ['end'],
  });

export const publishExamsSchema = z.object({ kind: z.enum(EXAM_KINDS) });

export const campusSettingsSchema = z.object({
  minAttendance: z.number().int().min(50).max(100),
});

export const notificationsQuerySchema = z.object({
  before: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export const markNotificationsSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(objectIdSchema).min(1).max(100) }),
]);

// ---- Coursework ----

/** An exact moment, e.g. `2026-10-23T18:59:00.000Z`. */
export const instantSchema = z.iso.datetime({ offset: true, message: 'Choose a date and time' });

const fileIds = z.array(objectIdSchema).max(MAX_FILES_PER_ITEM, 'At most 5 files').default([]);

export const assignmentSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the assignment a title').max(60),
    instructions: z.string().trim().max(5000).nullish(),
    dueAt: instantSchema,
    /** Accept late work until then (null = no late submissions). */
    lateUntil: instantSchema.nullish(),
    total: z.number().int('Use whole marks').min(1).max(100),
    attachmentIds: fileIds,
  })
  .refine((a) => !a.lateUntil || Date.parse(a.lateUntil) > Date.parse(a.dueAt), {
    message: 'Late work must be accepted until after the due time',
    path: ['lateUntil'],
  });

export const submissionSchema = z
  .object({ fileIds, note: z.string().trim().max(2000).nullish() })
  .refine((s) => s.fileIds.length > 0 || !!s.note, {
    message: 'Attach a file or write an answer',
    path: ['fileIds'],
  });

export const assignmentGradesSchema = z.object({
  grades: z
    .array(
      z.object({
        studentId: objectIdSchema,
        obtained: mark.nullable(),
        feedback: z.string().trim().max(1000).nullish(),
      }),
    )
    .min(1)
    .max(500),
});

export const returnGradesSchema = z.object({ returned: z.boolean() });

export const materialSchema = z
  .object({
    week: z.number().int().min(1, 'Week 1 to 18').max(18, 'Week 1 to 18'),
    title: z.string().trim().min(2, 'Give it a title').max(120),
    description: z.string().trim().max(500).nullish(),
    fileId: objectIdSchema.nullish(),
    url: z
      .url({ protocol: /^https?$/, message: 'Use a full web address starting with https://' })
      .max(500)
      .nullish(),
  })
  .refine((m) => !!m.fileId !== !!m.url, {
    message: 'Upload a file or give a link',
    path: ['url'],
  });

export const quizQuestionSchema = z
  .object({
    /** Kept when editing, so answers stay attached to their question. */
    id: z
      .string()
      .regex(/^q\d{1,3}$/)
      .optional(),
    text: z.string().trim().min(1, 'Write the question').max(500),
    options: z
      .array(z.string().trim().min(1, 'Fill in every option').max(200))
      .min(QUIZ_LIMITS.minOptions, 'Give at least two options')
      .max(QUIZ_LIMITS.maxOptions, 'At most six options'),
    correct: z.number().int().min(0),
    points: z.number().int().min(1).max(QUIZ_LIMITS.maxPoints).default(1),
    seconds: z.number().int().min(QUIZ_LIMITS.minSeconds).max(QUIZ_LIMITS.maxSeconds).default(30),
  })
  .refine((q) => q.correct < q.options.length, {
    message: 'Mark which option is right',
    path: ['correct'],
  })
  .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === q.options.length, {
    message: 'Each option must be different',
    path: ['options'],
  });

export const quizSchema = z.object({
  title: z.string().trim().min(3, 'Give the quiz a title').max(60),
  questions: z
    .array(quizQuestionSchema)
    .min(1, 'Add at least one question')
    .max(QUIZ_LIMITS.questions),
});

export const quizRefSchema = z.object({ quizId: objectIdSchema });

export const quizAnswerSchema = z.object({
  quizId: objectIdSchema,
  questionId: z.string().regex(/^q\d{1,3}$/),
  choice: z
    .number()
    .int()
    .min(0)
    .max(QUIZ_LIMITS.maxOptions - 1),
});

export type CreateTermInput = z.infer<typeof createTermSchema>;
export type RoomInput = z.input<typeof roomSchema>;
export type CatalogCourseInput = z.input<typeof catalogCourseSchema>;
export type ProgramInput = z.input<typeof programSchema>;
export type MarkNotificationsInput = z.infer<typeof markNotificationsSchema>;
export type ClassSlotInput = z.input<typeof classSlotSchema>;
export type ClassChangeInput = z.infer<typeof classChangeSchema>;
export type StartAttendanceInput = z.infer<typeof startAttendanceSchema>;
export type CheckInInput = z.infer<typeof checkInSchema>;
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
export type CampusSettingsInput = z.infer<typeof campusSettingsSchema>;
export type AssessmentInput = z.input<typeof assessmentSchema>;
export type MarksInput = z.input<typeof marksSchema>;
export type CourseGradingInput = z.input<typeof courseGradingSchema>;
export type ExamInput = z.input<typeof examSchema>;
export type OfficeInput = z.infer<typeof officeSchema>;
export type CalendarEventInput = z.input<typeof calendarEventSchema>;
export type AssignmentInput = z.input<typeof assignmentSchema>;
export type SubmissionInput = z.input<typeof submissionSchema>;
export type AssignmentGradesInput = z.input<typeof assignmentGradesSchema>;
export type MaterialInput = z.input<typeof materialSchema>;
export type QuizQuestionInput = z.input<typeof quizQuestionSchema>;
export type QuizInput = z.input<typeof quizSchema>;
export type QuizRefInput = z.infer<typeof quizRefSchema>;
export type QuizAnswerInput = z.infer<typeof quizAnswerSchema>;
