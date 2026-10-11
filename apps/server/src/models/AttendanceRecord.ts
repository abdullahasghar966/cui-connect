import type { AttendanceMethod, AttendanceStatus } from '@cui/shared';
import { ATTENDANCE_METHODS, ATTENDANCE_STATUSES } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

/** One student's mark in one attendance session. */
export interface AttendanceRecordDoc {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  offeringId: Types.ObjectId;
  studentId: Types.ObjectId;
  status: AttendanceStatus;
  /** `qr`: scanned the code; `manual`: marked by the teacher; `auto`: absent when it closed. */
  method: AttendanceMethod;
  markedById: Types.ObjectId | null;
  markedAt: Date;
}

const attendanceRecordSchema = new Schema<AttendanceRecordDoc>({
  sessionId: { type: Schema.Types.ObjectId, ref: 'AttendanceSession', required: true },
  offeringId: { type: Schema.Types.ObjectId, ref: 'CourseOffering', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ATTENDANCE_STATUSES, required: true },
  method: { type: String, enum: ATTENDANCE_METHODS, required: true },
  markedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  markedAt: { type: Date, required: true },
});

attendanceRecordSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });
attendanceRecordSchema.index({ offeringId: 1, studentId: 1 });

export const AttendanceRecord = model<AttendanceRecordDoc>(
  'AttendanceRecord',
  attendanceRecordSchema,
);
