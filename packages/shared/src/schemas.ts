/** Zod schemas shared by the REST API, the Socket.IO handlers and the web forms. */
import { z } from 'zod';
import {
  JOIN_POLICIES,
  MAX_MENTIONS,
  MEMBER_ROLES,
  MESSAGE_MAX_LENGTH,
  OFFICES,
  POST_POLICIES,
  REACTIONS,
  ROLES,
} from './constants';

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

export const regNoSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^(FA|SP)\d{2}-[A-Z]{2,4}-\d{3}$/, 'Registration number must look like FA23-BCS-001');

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email or registration number').max(120),
  password: z.string().min(1, 'Enter your password').max(200),
});

/** First-run setup: creates the first administrator from the browser. */
export const firstAdminSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  email: emailSchema,
  password: passwordSchema,
  setupCode: z.string().max(200).optional(),
});

/** A photo uploaded as `avatar` becomes the profile photo; null removes it. */
export const profilePhotoSchema = z.object({ photoId: objectIdSchema.nullable() });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(200),
  newPassword: passwordSchema,
  /** The caller's own socket stays connected; every other session is signed out. */
  keepSocketId: z.string().max(64).optional(),
});

const userFields = {
  name: z.string().trim().min(2, 'Name is too short').max(80),
  email: emailSchema,
  departmentId: objectIdSchema.nullish(),
  sectionId: objectIdSchema.nullish(),
  regNo: regNoSchema.nullish(),
  designation: z.string().trim().max(80).nullish(),
  office: z.enum(OFFICES).nullish(),
  isHOD: z.boolean().optional(),
  isCR: z.boolean().optional(),
};

export const createUserSchema = z
  .object({ ...userFields, password: passwordSchema, role: z.enum(ROLES) })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.role === 'student') {
      if (!v.sectionId) issue('sectionId', 'Students must belong to a section');
      if (!v.regNo) issue('regNo', 'Students need a registration number');
    }
    if (v.role === 'faculty' && !v.departmentId) {
      issue('departmentId', 'Faculty must belong to a department');
    }
    if (v.role === 'staff' && !v.office) issue('office', 'Staff must belong to an office');
    if (v.office === 'DEPARTMENT' && !v.departmentId) {
      issue('departmentId', 'Department office staff need a department');
    }
    if (v.isHOD && v.role !== 'faculty') issue('isHOD', 'Only faculty can be HOD');
    if (v.isCR && v.role !== 'student') issue('isCR', 'Only students can be CR');
  });

export const updateUserSchema = z
  .object({
    name: userFields.name,
    email: emailSchema,
    password: passwordSchema,
    departmentId: userFields.departmentId,
    sectionId: userFields.sectionId,
    designation: userFields.designation,
    office: userFields.office,
    isHOD: z.boolean(),
    isCR: z.boolean(),
    active: z.boolean(),
  })
  .partial();

export const csvImportSchema = z.object({
  csv: z.string().min(1, 'Paste CSV rows').max(200_000),
  defaultPassword: passwordSchema.optional(),
});

export const createDepartmentSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,6}$/, 'Use a 2–6 letter code, e.g. CS'),
  name: z.string().trim().min(3).max(100),
});

export const createSectionSchema = z.object({
  departmentId: objectIdSchema,
  program: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,5}$/, 'Program code like BCS'),
  intake: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(FA|SP)\d{2}$/, 'Intake like FA23'),
  name: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,5}-\d{1,2}[A-Z]$/, 'Section name like BCS-7A'),
  batchAdvisorId: objectIdSchema.nullish(),
});

export const updateSectionSchema = z.object({ batchAdvisorId: objectIdSchema.nullable() });

export const createCourseSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}\d{3}$/, 'Course code like CSC337'),
  title: z.string().trim().min(3).max(100),
  sectionId: objectIdSchema,
  instructorId: objectIdSchema,
  /** Defaults to every student registered in the section. */
  studentIds: z.array(objectIdSchema).max(500).optional(),
});

export const enrollSchema = z.object({ studentIds: z.array(objectIdSchema).min(1).max(500) });

export const groupSettingsSchema = z.object({
  postPolicy: z.enum(POST_POLICIES),
  allowedPosterRoles: z.array(z.enum(ROLES)).max(ROLES.length),
  eligibleRoles: z.array(z.enum(ROLES)).max(ROLES.length),
  locked: z.boolean(),
  joinPolicy: z.enum(JOIN_POLICIES),
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(280).optional(),
  type: z.enum(['SOCIETY', 'CUSTOM']),
  settings: groupSettingsSchema.partial().optional(),
  memberIds: z.array(objectIdSchema).max(500).optional(),
});

export const updateGroupSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(280).nullable().optional(),
  settings: groupSettingsSchema.partial().optional(),
});

export const addMemberSchema = z.object({
  userId: objectIdSchema,
  role: z.enum(MEMBER_ROLES).default('member'),
});

export const updateMemberSchema = z.object({ role: z.enum(MEMBER_ROLES) });

export const historyQuerySchema = z.object({
  before: objectIdSchema.optional(),
  after: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const directoryQuerySchema = z.object({
  q: z.string().trim().max(80).default(''),
});

export const userListQuerySchema = z.object({
  q: z.string().trim().max(80).default(''),
  role: z.enum(ROLES).optional(),
});

// ---- Socket.IO payloads ----

export const pollInputSchema = z.object({
  question: z.string().trim().min(3, 'Ask a question').max(300),
  options: z
    .array(z.string().trim().min(1, 'An option is empty').max(100))
    .min(2, 'A poll needs at least two options')
    .max(10, 'A poll can have up to 10 options')
    .refine((o) => new Set(o.map((x) => x.toLowerCase())).size === o.length, {
      message: 'Each option must be different',
    }),
  multiple: z.boolean().default(false),
});

export const sendMessageSchema = z.object({
  groupId: objectIdSchema,
  body: z
    .string()
    .trim()
    .min(1, 'Message is empty')
    .max(MESSAGE_MAX_LENGTH, `Messages are limited to ${MESSAGE_MAX_LENGTH} characters`),
  /** Client-generated id for idempotent retries and optimistic UI. */
  clientId: z.string().min(8).max(64),
  /** Makes the message a poll (the body repeats the question). */
  poll: pollInputSchema.optional(),
  /** Answers this earlier message of the same chat. */
  replyToId: objectIdSchema.optional(),
  /** Members mentioned with @Name (they are notified). */
  mentionIds: z.array(objectIdSchema).max(MAX_MENTIONS).optional(),
  /** A student's question in a course chat with their name hidden. */
  anonymous: z.boolean().optional(),
});

export const reactSchema = z.object({ messageId: objectIdSchema, emoji: z.enum(REACTIONS) });

/**
 * Push services browsers use. The server sends to the endpoint it's given, so only these hosts
 * are accepted: anything else could make the server call internal addresses (SSRF).
 */
export const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'push.apple.com',
] as const;

export const isPushServiceUrl = (value: string) => {
  // https://host[:port] followed by a path: no user@ part, no other scheme.
  const host = /^https:\/\/([a-z0-9.-]+)(?::\d{1,5})?(?:[/?#]|$)/i.exec(value)?.[1]?.toLowerCase();
  return !!host && PUSH_SERVICE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
};

export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .max(1000)
    .refine(isPushServiceUrl, 'This browser uses a push service that is not supported'),
  keys: z.object({
    p256dh: z.string().min(16).max(200),
    auth: z.string().min(8).max(100),
  }),
});

export const pushEndpointSchema = z.object({ endpoint: z.string().max(1000) });
export const pinSchema = z.object({ messageId: objectIdSchema, pinned: z.boolean() });

export const pollVoteSchema = z.object({
  messageId: objectIdSchema,
  /** Empty withdraws the vote. */
  optionIds: z.array(z.string().min(1).max(12)).max(10),
});

export const messageRefSchema = z.object({ messageId: objectIdSchema });
export const readReceiptSchema = z.object({ groupId: objectIdSchema, messageId: objectIdSchema });
export const groupRefSchema = z.object({ groupId: objectIdSchema });
export const lockGroupSchema = z.object({ groupId: objectIdSchema, locked: z.boolean() });
export const muteMemberSchema = z.object({
  groupId: objectIdSchema,
  userId: objectIdSchema,
  /** 0 un-mutes. Max one week. */
  minutes: z.number().int().min(0).max(10_080),
});
export const openDmSchema = z.object({ userId: objectIdSchema });

export type LoginInput = z.infer<typeof loginSchema>;
export type FirstAdminInput = z.infer<typeof firstAdminSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ProfilePhotoInput = z.infer<typeof profilePhotoSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CsvImportInput = z.infer<typeof csvImportSchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type AddMemberInput = z.input<typeof addMemberSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type MessageRefInput = z.infer<typeof messageRefSchema>;
export type PollInput = z.input<typeof pollInputSchema>;
export type PollVoteInput = z.infer<typeof pollVoteSchema>;
export type ReadReceiptInput = z.infer<typeof readReceiptSchema>;
export type GroupRefInput = z.infer<typeof groupRefSchema>;
export type LockGroupInput = z.infer<typeof lockGroupSchema>;
export type MuteMemberInput = z.infer<typeof muteMemberSchema>;
export type OpenDmInput = z.infer<typeof openDmSchema>;
export type ReactInput = z.infer<typeof reactSchema>;
export type PinInput = z.infer<typeof pinSchema>;
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
