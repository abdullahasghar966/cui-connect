import { DEFAULT_MIN_ATTENDANCE } from '@cui/shared';
import { model, Schema } from 'mongoose';

/** Campus-wide rules IT can change (a single document with `_id: 'campus'`). */
export interface CampusSettingsDoc {
  _id: string;
  minAttendance: number;
  updatedAt: Date;
}

const campusSettingsSchema = new Schema<CampusSettingsDoc>(
  {
    _id: { type: String, default: 'campus' },
    minAttendance: { type: Number, default: DEFAULT_MIN_ATTENDANCE },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

export const CampusSettings = model<CampusSettingsDoc>('CampusSettings', campusSettingsSchema);
