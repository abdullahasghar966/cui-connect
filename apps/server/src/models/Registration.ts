import { OFFICES, type Office, REGISTRATION_STATUSES, type RegistrationStatus } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

export interface RegistrationEventDoc {
  at: Date;
  byId: Types.ObjectId | null;
  byName: string | null;
  kind: 'submitted' | 'withdrawn' | 'approved' | 'returned';
  body: string | null;
}

/** A student's course plan for the coming term, approved by their batch advisor. */
export interface RegistrationDoc {
  _id: Types.ObjectId;
  studentId: Types.ObjectId;
  termId: Types.ObjectId;
  offerIds: Types.ObjectId[];
  status: RegistrationStatus;
  /** Who approves it: the batch advisor, or the department office if there is none. */
  route: {
    office: Office | null;
    departmentId: Types.ObjectId | null;
    userId: Types.ObjectId | null;
  };
  /** Offers whose seats this plan holds (set when sent, cleared when returned or withdrawn). */
  heldOfferIds: Types.ObjectId[];
  events: RegistrationEventDoc[];
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const eventSchema = new Schema<RegistrationEventDoc>(
  {
    at: { type: Date, required: true },
    byId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    byName: { type: String, default: null },
    kind: {
      type: String,
      enum: ['submitted', 'withdrawn', 'approved', 'returned'],
      required: true,
    },
    body: { type: String, default: null },
  },
  { _id: false },
);

const registrationSchema = new Schema<RegistrationDoc>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    offerIds: { type: [Schema.Types.ObjectId], ref: 'RegistrationOffer', default: [] },
    status: { type: String, enum: REGISTRATION_STATUSES, default: 'draft' },
    route: {
      office: { type: String, enum: [...OFFICES, null], default: null },
      departmentId: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
      userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    heldOfferIds: { type: [Schema.Types.ObjectId], default: [] },
    events: { type: [eventSchema], default: [] },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

registrationSchema.index({ studentId: 1, termId: 1 }, { unique: true });
registrationSchema.index({ 'route.userId': 1, status: 1 });
registrationSchema.index({ 'route.office': 1, status: 1 });
// Class lists: who holds a seat in an offer.
registrationSchema.index({ heldOfferIds: 1 });

export const Registration = model<RegistrationDoc>('Registration', registrationSchema);
