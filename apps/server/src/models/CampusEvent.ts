import {
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  type EventCategory,
  type EventStatus,
  RSVP_STATUSES,
  type RsvpStatus,
} from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

/** A campus event: published by an office, or proposed by a student or teacher and approved. */
export interface CampusEventDoc {
  _id: Types.ObjectId;
  title: string;
  description: string;
  category: EventCategory;
  /** Campus date and times. */
  date: string;
  start: string;
  end: string;
  venue: string;
  organiser: string;
  capacity: number | null;
  /** Counters kept with the RSVPs (going never passes capacity). */
  going: number;
  interested: number;
  status: EventStatus;
  createdById: Types.ObjectId;
  decidedById: Types.ObjectId | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const campusEventSchema = new Schema<CampusEventDoc>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: { type: String, enum: EVENT_CATEGORIES, required: true },
    date: { type: String, required: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    venue: { type: String, required: true },
    organiser: { type: String, required: true },
    capacity: { type: Number, default: null },
    going: { type: Number, default: 0 },
    interested: { type: Number, default: 0 },
    status: { type: String, enum: EVENT_STATUSES, default: 'pending' },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    decidedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, default: null },
  },
  { timestamps: true },
);

campusEventSchema.index({ status: 1, date: 1 });
campusEventSchema.index({ createdById: 1 });

export const CampusEvent = model<CampusEventDoc>('CampusEvent', campusEventSchema);

/** One person's answer to an event. */
export interface EventRsvpDoc {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  userId: Types.ObjectId;
  status: RsvpStatus;
  createdAt: Date;
}

const eventRsvpSchema = new Schema<EventRsvpDoc>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'CampusEvent', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: RSVP_STATUSES, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

eventRsvpSchema.index({ eventId: 1, userId: 1 }, { unique: true });
eventRsvpSchema.index({ userId: 1, status: 1 });

export const EventRsvp = model<EventRsvpDoc>('EventRsvp', eventRsvpSchema);
