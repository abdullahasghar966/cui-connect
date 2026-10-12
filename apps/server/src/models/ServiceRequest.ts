import {
  COMPLAINT_CATEGORIES,
  type ComplaintCategory,
  ID_CARD_REASONS,
  type IdCardReason,
  OFFICES,
  type Office,
  REQUEST_KINDS,
  REQUEST_STATUSES,
  type RequestKind,
  type RequestStatus,
} from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

export interface RequestEventDoc {
  at: Date;
  byId: Types.ObjectId | null;
  byName: string | null;
  kind: 'created' | 'status' | 'reply';
  status: RequestStatus | null;
  body: string | null;
}

/** A student's request (leave, transcript, bonafide, ID card) or complaint, with its timeline. */
export interface ServiceRequestDoc {
  _id: Types.ObjectId;
  kind: RequestKind;
  studentId: Types.ObjectId;
  /** Who handles it: a person (the batch advisor) or an office (of a department). */
  route: {
    office: Office | null;
    departmentId: Types.ObjectId | null;
    userId: Types.ObjectId | null;
  };
  title: string;
  status: RequestStatus;
  details: {
    from: string | null;
    to: string | null;
    reason: string | null;
    purpose: string | null;
    copies: number | null;
    cardReason: IdCardReason | null;
    category: ComplaintCategory | null;
    subject: string | null;
    description: string | null;
  };
  events: RequestEventDoc[];
  createdAt: Date;
  updatedAt: Date;
}

const eventSchema = new Schema<RequestEventDoc>(
  {
    at: { type: Date, required: true },
    byId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    byName: { type: String, default: null },
    kind: { type: String, enum: ['created', 'status', 'reply'], required: true },
    status: { type: String, enum: [...REQUEST_STATUSES, null], default: null },
    body: { type: String, default: null },
  },
  { _id: false },
);

const serviceRequestSchema = new Schema<ServiceRequestDoc>(
  {
    kind: { type: String, enum: REQUEST_KINDS, required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    route: {
      office: { type: String, enum: [...OFFICES, null], default: null },
      departmentId: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
      userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    title: { type: String, required: true },
    status: { type: String, enum: REQUEST_STATUSES, default: 'submitted' },
    details: {
      from: { type: String, default: null },
      to: { type: String, default: null },
      reason: { type: String, default: null },
      purpose: { type: String, default: null },
      copies: { type: Number, default: null },
      cardReason: { type: String, enum: [...ID_CARD_REASONS, null], default: null },
      category: { type: String, enum: [...COMPLAINT_CATEGORIES, null], default: null },
      subject: { type: String, default: null },
      description: { type: String, default: null },
    },
    events: { type: [eventSchema], default: [] },
  },
  { timestamps: true },
);

serviceRequestSchema.index({ studentId: 1, createdAt: -1 });
serviceRequestSchema.index({ 'route.userId': 1, status: 1 });
serviceRequestSchema.index({ 'route.office': 1, status: 1 });
// Approved leave covering a date (attendance marks those days "leave").
serviceRequestSchema.index({ kind: 1, status: 1, studentId: 1 });

export const ServiceRequest = model<ServiceRequestDoc>('ServiceRequest', serviceRequestSchema);
