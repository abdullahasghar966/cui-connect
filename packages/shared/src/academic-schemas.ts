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
import {
  EVENT_CATEGORIES,
  ITEM_CATEGORIES,
  isWebLink,
  JOB_KINDS,
  LOST_FOUND_KINDS,
  PLACE_KINDS,
  RSVP_STATUSES,
} from './campus';
import { OFFICES } from './constants';
import { MAX_FILES_PER_ITEM, QUIZ_LIMITS } from './coursework';
import { EVALUATION_QUESTIONS } from './evaluation';
import { FEE_INSTALMENTS, feeTotal, LATE_FEE } from './fees';
import { REGISTRATION_MODES } from './registration';
import {
  COMPLAINT_CATEGORIES,
  ID_CARD_REASONS,
  LEAVE_MAX_DAYS,
  leaveDays,
  REQUEST_STATUSES,
} from './requests';
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

// ---- Requests and complaints ----

const purpose = z.string().trim().min(3, 'Say what it is for').max(300);

export const newRequestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('leave'),
      from: dateSchema,
      to: dateSchema,
      reason: z.string().trim().min(10, 'Give a reason (a sentence or two)').max(1000),
    })
    .refine((r) => r.from <= r.to, {
      message: 'The leave must end on or after it starts',
      path: ['to'],
    })
    .refine((r) => leaveDays(r.from, r.to) <= LEAVE_MAX_DAYS, {
      message: `One application can cover at most ${LEAVE_MAX_DAYS} days`,
      path: ['to'],
    }),
  z.object({
    kind: z.literal('transcript'),
    copies: z.number().int().min(1).max(5),
    purpose,
  }),
  z.object({ kind: z.literal('bonafide'), purpose }),
  z.object({
    kind: z.literal('idcard'),
    cardReason: z.enum(ID_CARD_REASONS),
    description: z.string().trim().max(500).nullish(),
  }),
  z.object({
    kind: z.literal('complaint'),
    category: z.enum(COMPLAINT_CATEGORIES),
    subject: z.string().trim().min(3, 'Give it a short subject').max(120),
    description: z.string().trim().min(10, 'Describe what happened').max(3000),
  }),
]);

export const requestStatusSchema = z.object({
  status: z.enum(REQUEST_STATUSES),
  note: z.string().trim().max(1000).nullish(),
});

export const requestReplySchema = z.object({
  body: z.string().trim().min(1, 'Write a reply').max(2000),
});

export const requestListSchema = z.object({
  box: z.enum(['mine', 'inbox']).default('mine'),
});

// ---- Course registration ----

export const offerSlotSchema = z
  .object({ day: z.number().int().min(1).max(6), start: timeSchema, end: timeSchema })
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

/** A course section offered for the coming term. */
export const registrationOfferSchema = z.object({
  code: courseCodeSchema,
  sectionId: objectIdSchema,
  instructorId: objectIdSchema.nullish(),
  capacity: z.number().int().min(1).max(500),
  slots: z.array(offerSlotSchema).max(6),
});

/** Offers for a section's (or a department's sections') next semester from the degree plans. */
export const planOffersSchema = z
  .object({ departmentId: objectIdSchema.nullish(), sectionId: objectIdSchema.nullish() })
  .refine((r) => !!r.departmentId || !!r.sectionId, { message: 'Choose a department or section' });

export const registrationPlanSchema = z.object({
  offerIds: z.array(objectIdSchema).max(12, 'At most 12 courses'),
});

export const registrationReturnSchema = z.object({
  note: z.string().trim().min(3, 'Tell the student what to change').max(1000),
});

export const registrationApproveSchema = z.object({
  note: z.string().trim().max(1000).nullish(),
});

export const registrationWindowSchema = z.object({ mode: z.enum(REGISTRATION_MODES) });

export const registrationOffersQuerySchema = z.object({
  departmentId: objectIdSchema.optional(),
});

// ---- Campus events ----

export const campusEventSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the event a title').max(120),
    description: z.string().trim().min(10, 'Say a little about it').max(3000),
    category: z.enum(EVENT_CATEGORIES),
    date: dateSchema,
    start: timeSchema,
    end: timeSchema,
    venue: z.string().trim().min(2, 'Say where it is').max(120),
    organiser: z.string().trim().min(2, 'Say who is organising it').max(80),
    capacity: z.number().int().min(1).max(10_000).nullish(),
  })
  .refine((e) => toMinutes(e.end) > toMinutes(e.start), {
    message: 'The event must end after it starts',
    path: ['end'],
  });

export const rsvpSchema = z.object({ status: z.enum(RSVP_STATUSES).nullable() });

export const eventDecisionSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(500).nullish(),
});

export const eventCancelSchema = z.object({ note: z.string().trim().max(500).nullish() });

// ---- Jobs and lost & found ----

export const jobSchema = z
  .object({
    title: z.string().trim().min(3, 'Name the role').max(100),
    company: z.string().trim().min(2, 'Name the company').max(80),
    kind: z.enum(JOB_KINDS),
    location: z.string().trim().min(2, 'Say where it is').max(80),
    description: z.string().trim().min(10, 'Describe the role').max(3000),
    applyUrl: z
      .string()
      .trim()
      .max(500)
      .refine(isWebLink, 'Use a web link starting with https://')
      .nullish(),
    applyEmail: z.string().trim().max(120).email('Use a valid email').nullish(),
    deadline: dateSchema,
    programs: z.array(z.string().trim().toUpperCase().min(2).max(10)).max(10).default([]),
  })
  .refine((j) => !!j.applyUrl || !!j.applyEmail, {
    message: 'Give a link or an email to apply',
    path: ['applyUrl'],
  });

export const lostItemSchema = z.object({
  kind: z.enum(LOST_FOUND_KINDS),
  title: z.string().trim().min(3, 'Say what it is').max(80),
  category: z.enum(ITEM_CATEGORIES),
  description: z.string().trim().max(1000).nullish(),
  place: z.string().trim().min(2, 'Say where').max(120),
  date: dateSchema,
  photoId: objectIdSchema.nullish(),
});

export const lostClaimSchema = z.object({
  message: z
    .string()
    .trim()
    .min(5, 'Say how it is yours (a detail only the owner would know)')
    .max(500),
});

export const resolveItemSchema = z.object({ claimId: objectIdSchema.nullish() });

// ---- Campus map ----

export const openingHoursSchema = z
  .object({
    days: z.array(z.number().int().min(1).max(7)).min(1, 'Pick at least one day').max(7),
    open: timeSchema,
    close: timeSchema,
  })
  .refine((h) => toMinutes(h.close) > toMinutes(h.open), {
    message: 'It must close after it opens',
    path: ['close'],
  });

export const campusPlaceSchema = z.object({
  name: z.string().trim().min(2, 'Name the place').max(80),
  kind: z.enum(PLACE_KINDS),
  block: z.string().trim().min(1, 'Say which building').max(60),
  floor: z.number().int().min(-2).max(30).nullable().default(null),
  description: z.string().trim().max(300).nullish(),
  office: z.enum(OFFICES).nullish(),
  hours: z.array(openingHoursSchema).max(4).default([]),
});

// ---- Teacher evaluation ----

export const evaluationSchema = z.object({
  ratings: z
    .array(z.number().int().min(1).max(5))
    .length(EVALUATION_QUESTIONS.length, 'Answer every question'),
  wentWell: z.string().trim().max(1000).nullish(),
  improve: z.string().trim().max(1000).nullish(),
});

export const evaluationWindowSchema = z.object({ open: z.boolean() });

// ---- Fees ----

export const feeItemSchema = z.object({
  label: z.string().trim().min(2, 'Name each charge').max(60),
  amount: z.number().int('Whole rupees only').min(0).max(5_000_000),
});

/** A challan run: one challan per active student in the chosen part of the campus. */
export const issueChallansSchema = z
  .object({
    instalment: z.enum(FEE_INSTALMENTS),
    scope: z.enum(['campus', 'department', 'section']),
    departmentId: objectIdSchema.nullish(),
    sectionId: objectIdSchema.nullish(),
    dueDate: dateSchema,
    items: z.array(feeItemSchema).min(1, 'Add at least one charge').max(15),
    lateFee: z.number().int().min(0).max(100_000).default(LATE_FEE),
  })
  .refine((r) => r.scope !== 'department' || !!r.departmentId, {
    message: 'Choose a department',
    path: ['departmentId'],
  })
  .refine((r) => r.scope !== 'section' || !!r.sectionId, {
    message: 'Choose a section',
    path: ['sectionId'],
  })
  .refine((r) => feeTotal(r.items) > 0, {
    message: 'The challan must be for more than Rs 0',
    path: ['items'],
  });

export const markPaidSchema = z.object({
  paidOn: dateSchema,
  bankRef: z.string().trim().max(40).nullish(),
});

export const FEE_DESK_FILTERS = ['all', 'unpaid', 'overdue', 'paid'] as const;
export type FeeDeskFilter = (typeof FEE_DESK_FILTERS)[number];

export const feeDeskQuerySchema = z.object({
  departmentId: objectIdSchema.optional(),
  sectionId: objectIdSchema.optional(),
  instalment: z.enum(FEE_INSTALMENTS).optional(),
  status: z.enum(FEE_DESK_FILTERS).default('all'),
  q: z.string().trim().max(60).default(''),
});

// ---- Office-hour appointments ----

export const bookingSchema = z.object({
  teacherId: objectIdSchema,
  date: dateSchema,
  start: timeSchema,
  topic: z.string().trim().min(3, 'Say what you want to discuss').max(200),
});

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(200).nullish(),
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
export type BookingInput = z.infer<typeof bookingSchema>;
export type NewRequestInput = z.input<typeof newRequestSchema>;
export type RequestStatusInput = z.infer<typeof requestStatusSchema>;
export type RequestReplyInput = z.infer<typeof requestReplySchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
export type RegistrationOfferInput = z.input<typeof registrationOfferSchema>;
export type PlanOffersInput = z.input<typeof planOffersSchema>;
export type RegistrationPlanInput = z.infer<typeof registrationPlanSchema>;
export type RegistrationReturnInput = z.infer<typeof registrationReturnSchema>;
export type RegistrationApproveInput = z.input<typeof registrationApproveSchema>;
export type RegistrationWindowInput = z.infer<typeof registrationWindowSchema>;
export type CampusEventInput = z.input<typeof campusEventSchema>;
export type CampusPlaceInput = z.input<typeof campusPlaceSchema>;
export type JobInput = z.input<typeof jobSchema>;
export type LostItemInput = z.input<typeof lostItemSchema>;
export type LostClaimInput = z.infer<typeof lostClaimSchema>;
export type ResolveItemInput = z.input<typeof resolveItemSchema>;
export type RsvpInput = z.infer<typeof rsvpSchema>;
export type EventDecisionInput = z.input<typeof eventDecisionSchema>;
export type EventCancelInput = z.input<typeof eventCancelSchema>;
export type EvaluationInput = z.input<typeof evaluationSchema>;
export type EvaluationWindowInput = z.infer<typeof evaluationWindowSchema>;
export type IssueChallansInput = z.input<typeof issueChallansSchema>;
export type MarkPaidInput = z.infer<typeof markPaidSchema>;
export type FeeDeskQuery = z.input<typeof feeDeskQuerySchema>;
