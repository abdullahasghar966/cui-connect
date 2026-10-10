/** Zod schemas for the university features, shared by the REST API and the web forms. */
import { z } from 'zod';
import { DATE_PATTERN, ROOM_KINDS, TERM_PATTERN } from './academics';
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
