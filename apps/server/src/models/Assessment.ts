import { ASSESSMENT_TYPES, type AssessmentType } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

/** A quiz, assignment, sessional… of one course offering. Students see it once published. */
export interface AssessmentDoc {
  _id: Types.ObjectId;
  offeringId: Types.ObjectId;
  type: AssessmentType;
  title: string;
  total: number;
  date: string | null;
  published: boolean;
  publishedAt: Date | null;
  createdById: Types.ObjectId;
  createdAt: Date;
}

const assessmentSchema = new Schema<AssessmentDoc>(
  {
    offeringId: { type: Schema.Types.ObjectId, ref: 'CourseOffering', required: true, index: true },
    type: { type: String, enum: ASSESSMENT_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    total: { type: Number, required: true },
    date: { type: String, default: null },
    published: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Assessment = model<AssessmentDoc>('Assessment', assessmentSchema);
