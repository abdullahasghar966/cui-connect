import { ROOM_KINDS, type RoomKind } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

/** A classroom, lab or exam hall. */
export interface RoomDoc {
  _id: Types.ObjectId;
  name: string;
  block: string;
  floor: number | null;
  kind: RoomKind;
  capacity: number;
  /** Exam seating layout: rows × seats per row (0 when the room isn't used for exams). */
  examRows: number;
  examCols: number;
  createdAt: Date;
}

const roomSchema = new Schema<RoomDoc>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    block: { type: String, required: true, trim: true },
    floor: { type: Number, default: null },
    kind: { type: String, enum: ROOM_KINDS, required: true },
    capacity: { type: Number, required: true },
    examRows: { type: Number, default: 0 },
    examCols: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Room = model<RoomDoc>('Room', roomSchema);
