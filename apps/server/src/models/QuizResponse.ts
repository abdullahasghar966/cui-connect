import { model, Schema, type Types } from 'mongoose';

/** One student's answer to one question of a live quiz (the first answer is final). */
export interface QuizResponseDoc {
  _id: Types.ObjectId;
  quizId: Types.ObjectId;
  questionId: string;
  studentId: Types.ObjectId;
  choice: number;
  correct: boolean;
  points: number;
  /** Time from the question appearing to the answer. */
  ms: number;
  createdAt: Date;
}

const quizResponseSchema = new Schema<QuizResponseDoc>(
  {
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
    questionId: { type: String, required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    choice: { type: Number, required: true },
    correct: { type: Boolean, required: true },
    points: { type: Number, required: true },
    ms: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

quizResponseSchema.index({ quizId: 1, questionId: 1, studentId: 1 }, { unique: true });
quizResponseSchema.index({ quizId: 1, studentId: 1 });

export const QuizResponse = model<QuizResponseDoc>('QuizResponse', quizResponseSchema);
