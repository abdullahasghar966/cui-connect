import { model, Schema, type Types } from 'mongoose';

/** Coursework handed in online. Its grades live in a linked marks-sheet column (an Assessment). */
export interface AssignmentDoc {
  _id: Types.ObjectId;
  offeringId: Types.ObjectId;
  title: string;
  instructions: string | null;
  dueAt: Date;
  /** Late work is accepted until then; null = not accepted. */
  lateUntil: Date | null;
  total: number;
  attachmentIds: Types.ObjectId[];
  assessmentId: Types.ObjectId;
  createdById: Types.ObjectId;
  createdAt: Date;
}

const assignmentSchema = new Schema<AssignmentDoc>(
  {
    offeringId: { type: Schema.Types.ObjectId, ref: 'CourseOffering', required: true, index: true },
    title: { type: String, required: true, trim: true },
    instructions: { type: String, default: null },
    dueAt: { type: Date, required: true },
    lateUntil: { type: Date, default: null },
    total: { type: Number, required: true },
    attachmentIds: { type: [Schema.Types.ObjectId], default: [] },
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true, unique: true },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

assignmentSchema.index({ dueAt: 1 });

export const Assignment = model<AssignmentDoc>('Assignment', assignmentSchema);
