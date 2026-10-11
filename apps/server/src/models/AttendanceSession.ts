import { model, Schema, type Types } from 'mongoose';

/**
 * One class's attendance. While it is open, the classroom screen shows a QR code signed with
 * `secret` for the current 10-second window; the secret itself never leaves the server.
 */
export interface AttendanceSessionDoc {
  _id: Types.ObjectId;
  offeringId: Types.ObjectId;
  termId: Types.ObjectId;
  /** The timetabled class it was taken for, if any. */
  slotId: Types.ObjectId | null;
  date: string;
  start: string | null;
  secret: string;
  status: 'open' | 'closed';
  openedById: Types.ObjectId;
  openedAt: Date;
  closedAt: Date | null;
}

const attendanceSessionSchema = new Schema<AttendanceSessionDoc>({
  offeringId: { type: Schema.Types.ObjectId, ref: 'CourseOffering', required: true },
  termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
  slotId: { type: Schema.Types.ObjectId, ref: 'ClassSlot', default: null },
  date: { type: String, required: true },
  start: { type: String, default: null },
  secret: { type: String, required: true, select: false },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  openedById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  openedAt: { type: Date, required: true },
  closedAt: { type: Date, default: null },
});

// One session per class meeting; taking attendance again reopens it.
attendanceSessionSchema.index({ offeringId: 1, date: 1, slotId: 1 }, { unique: true });
attendanceSessionSchema.index({ offeringId: 1, status: 1 });

export const AttendanceSession = model<AttendanceSessionDoc>(
  'AttendanceSession',
  attendanceSessionSchema,
);
