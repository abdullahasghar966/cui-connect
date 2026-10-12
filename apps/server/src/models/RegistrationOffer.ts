import { model, Schema, type Types } from 'mongoose';

/**
 * A course section offered for the coming term. Kept apart from `CourseOffering` (this term's
 * classes, which drive chats, timetables and attendance) until the term begins.
 */
export interface RegistrationOfferDoc {
  _id: Types.ObjectId;
  termId: Types.ObjectId;
  code: string;
  title: string;
  credits: number;
  labCredits: number;
  /** The section it is planned for (students of other sections may still take it). */
  sectionId: Types.ObjectId;
  departmentId: Types.ObjectId;
  /** Null while the department hasn't chosen a teacher. */
  instructorId: Types.ObjectId | null;
  capacity: number;
  /** Seats held by sent and approved plans (changed atomically, never above capacity). */
  seatsTaken: number;
  slots: { day: number; start: string; end: string }[];
  createdById: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const registrationOfferSchema = new Schema<RegistrationOfferDoc>(
  {
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    code: { type: String, required: true },
    title: { type: String, required: true },
    credits: { type: Number, required: true },
    labCredits: { type: Number, default: 0 },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
    instructorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    capacity: { type: Number, required: true },
    seatsTaken: { type: Number, default: 0 },
    slots: {
      type: [{ _id: false, day: Number, start: String, end: String }],
      default: [],
    },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

registrationOfferSchema.index({ termId: 1, code: 1, sectionId: 1 }, { unique: true });
registrationOfferSchema.index({ termId: 1, departmentId: 1 });

export const RegistrationOffer = model<RegistrationOfferDoc>(
  'RegistrationOffer',
  registrationOfferSchema,
);
