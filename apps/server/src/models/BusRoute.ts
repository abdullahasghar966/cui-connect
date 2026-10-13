import { model, Schema, type Types } from 'mongoose';

/** A university bus route: its stops (farthest first) with morning and evening times. */
export interface BusRouteDoc {
  _id: Types.ObjectId;
  name: string;
  bus: string;
  capacity: number;
  /** ISO weekdays it runs. */
  days: number[];
  stops: { name: string; morning: string; evening: string }[];
  /** For staff and IT only. */
  driverName: string | null;
  driverPhone: string | null;
  notes: string | null;
  /** A notice for one day only (e.g. running late). */
  notice: { text: string; date: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

const noticeSchema = new Schema<{ text: string; date: string }>(
  { text: { type: String, required: true }, date: { type: String, required: true } },
  { _id: false },
);

const busRouteSchema = new Schema<BusRouteDoc>(
  {
    name: { type: String, required: true, trim: true },
    bus: { type: String, required: true },
    capacity: { type: Number, required: true },
    days: { type: [Number], default: [1, 2, 3, 4, 5] },
    stops: {
      type: [{ _id: false, name: String, morning: String, evening: String }],
      default: [],
    },
    driverName: { type: String, default: null },
    driverPhone: { type: String, default: null },
    notes: { type: String, default: null },
    notice: { type: noticeSchema, default: null },
  },
  { timestamps: true },
);

busRouteSchema.index({ name: 1 }, { unique: true });

export const BusRoute = model<BusRouteDoc>('BusRoute', busRouteSchema);

/** A route someone follows, with the stop they use (they hear about changes and delays). */
export interface SavedRouteDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  routeId: Types.ObjectId;
  stop: string | null;
}

const savedRouteSchema = new Schema<SavedRouteDoc>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  routeId: { type: Schema.Types.ObjectId, ref: 'BusRoute', required: true },
  stop: { type: String, default: null },
});

savedRouteSchema.index({ userId: 1, routeId: 1 }, { unique: true });
savedRouteSchema.index({ routeId: 1 });

export const SavedRoute = model<SavedRouteDoc>('SavedRoute', savedRouteSchema);
