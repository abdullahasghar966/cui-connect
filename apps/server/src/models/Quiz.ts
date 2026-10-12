import { QUIZ_STATUSES, type QuizStatus } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

export interface QuizQuestion {
  /** Stable id (`q1`, `q2`…), so answers stay with their question when the quiz is edited. */
  id: string;
  text: string;
  options: string[];
  correct: number;
  points: number;
  seconds: number;
}

/**
 * A live in-class quiz. Draft → live (the teacher shows one question at a time; answers close when
 * the time is up and the right answer is shown) → ended. Scores can be saved as quiz marks.
 */
export interface QuizDoc {
  _id: Types.ObjectId;
  offeringId: Types.ObjectId;
  title: string;
  questions: QuizQuestion[];
  status: QuizStatus;
  /** Index of the question on screen; -1 before the first. */
  current: number;
  questionStartedAt: Date | null;
  revealed: boolean;
  startedAt: Date | null;
  endedAt: Date | null;
  /** The marks-sheet column the scores were saved to. */
  assessmentId: Types.ObjectId | null;
  createdById: Types.ObjectId;
  createdAt: Date;
}

const questionSchema = new Schema<QuizQuestion>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    options: { type: [String], required: true },
    correct: { type: Number, required: true },
    points: { type: Number, required: true },
    seconds: { type: Number, required: true },
  },
  { _id: false },
);

const quizSchema = new Schema<QuizDoc>(
  {
    offeringId: { type: Schema.Types.ObjectId, ref: 'CourseOffering', required: true, index: true },
    title: { type: String, required: true, trim: true },
    questions: { type: [questionSchema], default: [] },
    status: { type: String, enum: QUIZ_STATUSES, default: 'draft' },
    current: { type: Number, default: -1 },
    questionStartedAt: { type: Date, default: null },
    revealed: { type: Boolean, default: false },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', default: null },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

quizSchema.index({ status: 1 });

export const Quiz = model<QuizDoc>('Quiz', quizSchema);
