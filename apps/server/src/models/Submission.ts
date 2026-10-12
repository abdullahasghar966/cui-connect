import { model, Schema, type Types } from 'mongoose';

/** One student's work for one assignment (handing in again replaces it while it's open). */
export interface SubmissionDoc {
  _id: Types.ObjectId;
  assignmentId: Types.ObjectId;
  offeringId: Types.ObjectId;
  studentId: Types.ObjectId;
  fileIds: Types.ObjectId[];
  note: string | null;
  submittedAt: Date;
  late: boolean;
  /** The teacher's comments; the mark itself is in the marks sheet. */
  feedback: string | null;
}

const submissionSchema = new Schema<SubmissionDoc>({
  assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
  offeringId: { type: Schema.Types.ObjectId, ref: 'CourseOffering', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  fileIds: { type: [Schema.Types.ObjectId], default: [] },
  note: { type: String, default: null },
  submittedAt: { type: Date, required: true },
  late: { type: Boolean, default: false },
  feedback: { type: String, default: null },
});

submissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });
submissionSchema.index({ studentId: 1 });

export const Submission = model<SubmissionDoc>('Submission', submissionSchema);
