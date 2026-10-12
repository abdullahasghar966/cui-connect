import { FEE_INSTALMENTS, type FeeInstalment } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

/** One fee challan: what a student owes for (part of) a term, and the payment once recorded. */
export interface FeeChallanDoc {
  _id: Types.ObjectId;
  studentId: Types.ObjectId;
  termId: Types.ObjectId;
  instalment: FeeInstalment;
  challanNo: string;
  items: { label: string; amount: number }[];
  /** Campus date, `YYYY-MM-DD`; overdue from the next day. */
  dueDate: string;
  lateFee: number;
  issuedById: Types.ObjectId | null;
  /** Set by the Accounts Office when the bank's copy arrives. */
  paidOn: string | null;
  amountPaid: number | null;
  bankRef: string | null;
  markedById: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const feeChallanSchema = new Schema<FeeChallanDoc>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    instalment: { type: String, enum: FEE_INSTALMENTS, required: true },
    challanNo: { type: String, required: true, unique: true },
    items: {
      type: [{ _id: false, label: { type: String, required: true }, amount: Number }],
      default: [],
    },
    dueDate: { type: String, required: true },
    lateFee: { type: Number, default: 0 },
    issuedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    paidOn: { type: String, default: null },
    amountPaid: { type: Number, default: null },
    bankRef: { type: String, default: null },
    markedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

// One challan of each kind per student per term (full vs instalments is checked when issuing).
feeChallanSchema.index({ studentId: 1, termId: 1, instalment: 1 }, { unique: true });
// The fee desk (a term's challans) and reminders (unpaid challans due on a day).
feeChallanSchema.index({ termId: 1, studentId: 1 });
feeChallanSchema.index({ dueDate: 1, paidOn: 1 });

export const FeeChallan = model<FeeChallanDoc>('FeeChallan', feeChallanSchema);
