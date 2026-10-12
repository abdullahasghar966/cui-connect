import { OFFICES, type Office, PLACE_KINDS, type PlaceKind } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

/** An office or facility on the campus map (rooms come from the Room collection). */
export interface CampusPlaceDoc {
  _id: Types.ObjectId;
  name: string;
  kind: PlaceKind;
  block: string;
  floor: number | null;
  description: string | null;
  /** The office it houses, if any. */
  office: Office | null;
  hours: { days: number[]; open: string; close: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const campusPlaceSchema = new Schema<CampusPlaceDoc>(
  {
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: PLACE_KINDS, required: true },
    block: { type: String, required: true, trim: true },
    floor: { type: Number, default: null },
    description: { type: String, default: null },
    office: { type: String, enum: [...OFFICES, null], default: null },
    hours: {
      type: [{ _id: false, days: [Number], open: String, close: String }],
      default: [],
    },
  },
  { timestamps: true },
);

campusPlaceSchema.index({ name: 1 }, { unique: true });

export const CampusPlace = model<CampusPlaceDoc>('CampusPlace', campusPlaceSchema);
