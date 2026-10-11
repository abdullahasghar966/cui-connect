import { model, Schema, type Types } from 'mongoose';

/** Where a student sits for one paper. */
export interface SeatAssignmentDoc {
  _id: Types.ObjectId;
  examId: Types.ObjectId;
  studentId: Types.ObjectId;
  offeringId: Types.ObjectId;
  roomId: Types.ObjectId;
  row: number;
  seat: number;
}

const seatAssignmentSchema = new Schema<SeatAssignmentDoc>({
  examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  offeringId: { type: Schema.Types.ObjectId, ref: 'CourseOffering', required: true },
  roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  row: { type: Number, required: true },
  seat: { type: Number, required: true },
});

seatAssignmentSchema.index({ examId: 1, studentId: 1 }, { unique: true });
seatAssignmentSchema.index({ studentId: 1 });

export const SeatAssignment = model<SeatAssignmentDoc>('SeatAssignment', seatAssignmentSchema);
