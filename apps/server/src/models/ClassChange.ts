import { model, Schema, type Types } from 'mongoose';

/** A one-off change to one date of a weekly class: cancelled, or moved elsewhere. */
export interface ClassChangeDoc {
  _id: Types.ObjectId;
  slotId: Types.ObjectId;
  offeringId: Types.ObjectId;
  termId: Types.ObjectId;
  /** The date the class would normally happen. */
  date: string;
  kind: 'cancelled' | 'moved';
  newDate: string | null;
  newStart: string | null;
  newEnd: string | null;
  newRoomId: Types.ObjectId | null;
  note: string | null;
  byId: Types.ObjectId;
  createdAt: Date;
}

const classChangeSchema = new Schema<ClassChangeDoc>(
  {
    slotId: { type: Schema.Types.ObjectId, ref: 'ClassSlot', required: true },
    offeringId: { type: Schema.Types.ObjectId, ref: 'CourseOffering', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    date: { type: String, required: true },
    kind: { type: String, enum: ['cancelled', 'moved'], required: true },
    newDate: { type: String, default: null },
    newStart: { type: String, default: null },
    newEnd: { type: String, default: null },
    newRoomId: { type: Schema.Types.ObjectId, ref: 'Room', default: null },
    note: { type: String, default: null },
    byId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

classChangeSchema.index({ slotId: 1, date: 1 }, { unique: true });
classChangeSchema.index({ termId: 1, date: 1 });
classChangeSchema.index({ termId: 1, newDate: 1 });

export const ClassChange = model<ClassChangeDoc>('ClassChange', classChangeSchema);
