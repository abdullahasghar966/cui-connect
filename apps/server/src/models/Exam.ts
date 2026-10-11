import { EXAM_KINDS, type ExamKind } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

/** One paper on the date sheet: a course code sat by one or more sections at the same time. */
export interface ExamDoc {
  _id: Types.ObjectId;
  termId: Types.ObjectId;
  kind: ExamKind;
  code: string;
  title: string;
  offeringIds: Types.ObjectId[];
  date: string;
  start: string;
  end: string;
  roomIds: Types.ObjectId[];
  published: boolean;
  publishedAt: Date | null;
  createdById: Types.ObjectId;
  createdAt: Date;
}

const examSchema = new Schema<ExamDoc>(
  {
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    kind: { type: String, enum: EXAM_KINDS, required: true },
    code: { type: String, required: true, uppercase: true },
    title: { type: String, required: true },
    offeringIds: { type: [{ type: Schema.Types.ObjectId, ref: 'CourseOffering' }], default: [] },
    date: { type: String, required: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    roomIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Room' }], default: [] },
    published: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One paper per course and kind each term.
examSchema.index({ termId: 1, kind: 1, code: 1 }, { unique: true });
examSchema.index({ termId: 1, date: 1 });

export const Exam = model<ExamDoc>('Exam', examSchema);
