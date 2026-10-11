/** Zod schemas for the university features, shared by the REST API and the web forms. */
import { z } from 'zod';
import {
  CLASS_KINDS,
  DATE_PATTERN,
  ROOM_KINDS,
  TERM_PATTERN,
  TIME_PATTERN,
  toMinutes,
} from './academics';
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

export const notificationsQuerySchema = z.object({
  before: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export const markNotificationsSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(objectIdSchema).min(1).max(100) }),
]);

export type CreateTermInput = z.infer<typeof createTermSchema>;
export type RoomInput = z.input<typeof roomSchema>;
export type CatalogCourseInput = z.input<typeof catalogCourseSchema>;
export type ProgramInput = z.input<typeof programSchema>;
export type MarkNotificationsInput = z.infer<typeof markNotificationsSchema>;
export type ClassSlotInput = z.input<typeof classSlotSchema>;
export type ClassChangeInput = z.infer<typeof classChangeSchema>;
