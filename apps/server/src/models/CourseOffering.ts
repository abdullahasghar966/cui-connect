import { ASSESSMENT_TYPES, type GradingWeights } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

/** A course taught to a specific section in one term, e.g. CSC337 for BCS-7A in FA26. */
export interface CourseOfferingDoc {
  _id: Types.ObjectId;
  code: string;
  title: string;
  sectionId: Types.ObjectId;
  instructorId: Types.ObjectId;
  studentIds: Types.ObjectId[];
  /** Null on offerings created before terms existed; backfilled to the current term at startup. */
  termId: Types.ObjectId | null;
  /** Seats available at registration (null = no limit). */
  capacity: number | null;
  /** Null uses the campus default (DEFAULT_GRADING). */
  grading: GradingWeights | null;
  createdAt: Date;
}

const gradingSchema = new Schema<GradingWeights>(
  Object.fromEntries(ASSESSMENT_TYPES.map((type) => [type, { type: Number, default: 0 }])),
  { _id: false },
);

const courseSchema = new Schema<CourseOfferingDoc>(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: true },
    instructorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    studentIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [], index: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', default: null, index: true },
    capacity: { type: Number, default: null },
    grading: { type: gradingSchema, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

courseSchema.index({ code: 1, sectionId: 1, termId: 1 }, { unique: true });

export const CourseOffering = model<CourseOfferingDoc>('CourseOffering', courseSchema);
