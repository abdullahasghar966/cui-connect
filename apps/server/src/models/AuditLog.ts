import type { AuditSeverity } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

export interface AuditLogDoc {
  _id: Types.ObjectId;
  action: string;
  severity: AuditSeverity;
  summary: string;
  actorId: Types.ObjectId | null;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: Date;
}

const auditSchema = new Schema<AuditLogDoc>(
  {
    action: { type: String, required: true, index: true },
    severity: { type: String, enum: ['info', 'warning'], default: 'info' },
    summary: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    targetType: { type: String, default: null },
    targetId: { type: String, default: null },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditSchema.index({ createdAt: -1 });

export const AuditLog = model<AuditLogDoc>('AuditLog', auditSchema);
