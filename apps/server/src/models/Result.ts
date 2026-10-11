import { model, Schema, type Types } from 'mongoose';

/**
 * A final grade on a student's record: written when a teacher finalises a course, or imported
 * for earlier terms. Transcripts and the CGPA are built from these.
 */
export interface ResultDoc {
  _id: Types.ObjectId;
  studentId: Types.ObjectId;
  termId: Types.ObjectId;
  /** The offering it came from (null for imported earlier terms). */
  offeringId: Types.ObjectId | null;
  code: string;
  title: string;
  credits: number;
  percent: number;
  grade: string;
  points: number;
  createdAt: Date;
}

const resultSchema = new Schema<ResultDoc>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    offeringId: { type: Schema.Types.ObjectId, ref: 'CourseOffering', default: null },
    code: { type: String, required: true },
    title: { type: String, required: true },
    credits: { type: Number, required: true },
    percent: { type: Number, required: true },
    grade: { type: String, required: true },
    points: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

resultSchema.index({ studentId: 1, termId: 1, code: 1 }, { unique: true });

export const Result = model<ResultDoc>('Result', resultSchema);
