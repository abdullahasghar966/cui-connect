import type { Decision, ErrorCode } from '@cui/shared';
import { z } from 'zod';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'VALIDATION', message, details);
export const unauthorized = (message = 'Please sign in to continue.') =>
  new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message: string, details?: unknown) =>
  new AppError(403, 'FORBIDDEN', message, details);
export const notFound = (message = 'Not found.') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
export const rateLimited = (message = 'You are sending messages too quickly. Slow down.') =>
  new AppError(429, 'RATE_LIMITED', message);

/** Validates untrusted input, turning Zod issues into a 400 with field errors. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    throw badRequest(`${where}${first?.message ?? 'Invalid input'}`, z.flattenError(result.error));
  }
  return result.data;
}

/** Throws a 403 carrying the policy engine's human-readable reason. */
export function assertAllowed(decision: Decision): void {
  if (!decision.allowed) throw forbidden(decision.reason, { reason: decision.code });
}

export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}
