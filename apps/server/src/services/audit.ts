import type { AuditSeverity } from '@cui/shared';
import { logger } from '../lib/logger';
import { AuditLog, type UserDoc } from '../models';
import { publishAudit } from '../realtime/notifier';
import { recordDenied } from '../realtime/stats';
import { type Id, idOf, toAuditDTO } from './mappers';

export type AuditActor = Pick<UserDoc, '_id' | 'name' | 'role'> | null;

export interface AuditInput {
  action: string;
  summary: string;
  actor?: AuditActor;
  severity?: AuditSeverity;
  targetType?: string;
  targetId?: Id | null;
  meta?: Record<string, unknown>;
}

/**
 * Persists an audit entry and streams it to connected admins. Never throws: auditing must
 * not break the action being audited. Message bodies are never recorded (privacy).
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    if (input.severity === 'warning') recordDenied();
    const log = await AuditLog.create({
      action: input.action,
      summary: input.summary,
      severity: input.severity ?? 'info',
      actorId: input.actor?._id ?? null,
      targetType: input.targetType ?? null,
      targetId: idOf(input.targetId),
      meta: input.meta ?? null,
    });
    publishAudit(toAuditDTO(log, input.actor));
  } catch (err) {
    logger.error({ err }, 'Failed to write audit log');
  }
}
