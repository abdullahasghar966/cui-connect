import { randomUUID } from 'node:crypto';
import { model, Schema, type Types } from 'mongoose';

/**
 * One course's anonymous answers. There is no student id anywhere in it, no time, and each
 * answer is put at a random place in the list, so neither storage order nor a timestamp can
 * match an answer to the receipt of the student who gave it.
 */
export interface EvaluationSheetDoc {
  /** The course offering (one sheet per offering). */
  _id: Types.ObjectId;
  termId: Types.ObjectId;
  instructorId: Types.ObjectId | null;
  departmentId: Types.ObjectId | null;
  responses: { ratings: number[]; wentWell: string | null; improve: string | null }[];
}

const evaluationSheetSchema = new Schema<EvaluationSheetDoc>(
  {
    _id: { type: Schema.Types.ObjectId, required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    instructorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
    responses: {
      type: [
        {
          _id: false,
          ratings: [Number],
          wentWell: { type: String, default: null },
          improve: { type: String, default: null },
        },
      ],
      default: [],
    },
  },
  { versionKey: false },
);

export const EvaluationSheet = model<EvaluationSheetDoc>('EvaluationSheet', evaluationSheetSchema);

/**
 * That a student has evaluated a course (so they can't answer twice), with the day only. Its id is
 * random rather than an ObjectId, which would carry the exact second it was written.
 */
export interface EvaluationReceiptDoc {
  _id: string;
  studentId: Types.ObjectId;
  offeringId: Types.ObjectId;
  termId: Types.ObjectId;
  /** Campus date, `YYYY-MM-DD`. */
  day: string;
}

const evaluationReceiptSchema = new Schema<EvaluationReceiptDoc>(
  {
    _id: { type: String, default: () => randomUUID() },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    offeringId: { type: Schema.Types.ObjectId, ref: 'CourseOffering', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    day: { type: String, required: true },
  },
  { versionKey: false },
);

evaluationReceiptSchema.index({ studentId: 1, offeringId: 1 }, { unique: true });
evaluationReceiptSchema.index({ offeringId: 1 });

export const EvaluationReceipt = model<EvaluationReceiptDoc>(
  'EvaluationReceipt',
  evaluationReceiptSchema,
);
