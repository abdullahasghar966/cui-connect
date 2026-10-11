import { model, Schema, type Types } from 'mongoose';

/** One student's mark in one assessment (null = not entered yet). */
export interface MarkDoc {
  _id: Types.ObjectId;
  assessmentId: Types.ObjectId;
  offeringId: Types.ObjectId;
  studentId: Types.ObjectId;
  obtained: number | null;
  updatedById: Types.ObjectId | null;
  updatedAt: Date;
}

const markSchema = new Schema<MarkDoc>(
  {
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
    offeringId: { type: Schema.Types.ObjectId, ref: 'CourseOffering', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    obtained: { type: Number, default: null },
    updatedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

markSchema.index({ assessmentId: 1, studentId: 1 }, { unique: true });
markSchema.index({ offeringId: 1, studentId: 1 });

export const Mark = model<MarkDoc>('Mark', markSchema);
