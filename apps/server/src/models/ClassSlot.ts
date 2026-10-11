import { CLASS_KINDS, type ClassKind } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

/**
 * A weekly class of a course offering (e.g. every Monday 08:30–10:00 in Lab 3). Section and
 * instructor are copied from the offering so clash checks are a single query.
 */
export interface ClassSlotDoc {
  _id: Types.ObjectId;
  offeringId: Types.ObjectId;
  termId: Types.ObjectId;
  sectionId: Types.ObjectId;
  instructorId: Types.ObjectId;
  roomId: Types.ObjectId | null;
  /** ISO weekday, 1 = Monday … 6 = Saturday. */
  day: number;
  start: string;
  end: string;
  kind: ClassKind;
  createdAt: Date;
}

const classSlotSchema = new Schema<ClassSlotDoc>(
  {
    offeringId: { type: Schema.Types.ObjectId, ref: 'CourseOffering', required: true, index: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: true },
    instructorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', default: null },
    day: { type: Number, required: true, min: 1, max: 6 },
    start: { type: String, required: true },
    end: { type: String, required: true },
    kind: { type: String, enum: CLASS_KINDS, default: 'lecture' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

classSlotSchema.index({ termId: 1, day: 1 });

export const ClassSlot = model<ClassSlotDoc>('ClassSlot', classSlotSchema);
