import { BOOKING_STATUSES, type BookingStatus } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

/** A student's appointment in a teacher's office hours. */
export interface BookingDoc {
  _id: Types.ObjectId;
  teacherId: Types.ObjectId;
  studentId: Types.ObjectId;
  date: string;
  start: string;
  end: string;
  topic: string;
  status: BookingStatus;
  cancelledById: Types.ObjectId | null;
  cancelReason: string | null;
  createdAt: Date;
}

const bookingSchema = new Schema<BookingDoc>(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    topic: { type: String, required: true, trim: true },
    status: { type: String, enum: BOOKING_STATUSES, default: 'booked' },
    cancelledById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cancelReason: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One student per slot: two people booking at the same moment can't both win.
bookingSchema.index(
  { teacherId: 1, date: 1, start: 1 },
  { unique: true, partialFilterExpression: { status: 'booked' } },
);
bookingSchema.index({ studentId: 1, date: 1 });

export const Booking = model<BookingDoc>('Booking', bookingSchema);
