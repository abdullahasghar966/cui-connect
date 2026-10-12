import { CALENDAR_KINDS, type CalendarKind } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

/** A date on the academic calendar: a holiday, an exam period, a registration window… */
export interface CalendarEventDoc {
  _id: Types.ObjectId;
  title: string;
  kind: CalendarKind;
  startsOn: string;
  endsOn: string;
  description: string | null;
  createdById: Types.ObjectId | null;
  createdAt: Date;
}

const calendarEventSchema = new Schema<CalendarEventDoc>(
  {
    title: { type: String, required: true, trim: true },
    kind: { type: String, enum: CALENDAR_KINDS, required: true },
    startsOn: { type: String, required: true },
    endsOn: { type: String, required: true },
    description: { type: String, default: null, trim: true },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

calendarEventSchema.index({ startsOn: 1, endsOn: 1 });
calendarEventSchema.index({ kind: 1, startsOn: 1 });

export const CalendarEvent = model<CalendarEventDoc>('CalendarEvent', calendarEventSchema);
