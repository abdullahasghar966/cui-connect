import { model, Schema, type Types } from 'mongoose';

/** A course taught to a specific section in the current term, e.g. CSC337 for BCS-7A. */
export interface CourseOfferingDoc {
  _id: Types.ObjectId;
  code: string;
  title: string;
  sectionId: Types.ObjectId;
  instructorId: Types.ObjectId;
  studentIds: Types.ObjectId[];
  createdAt: Date;
}

const courseSchema = new Schema<CourseOfferingDoc>(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: true },
    instructorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    studentIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [], index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

courseSchema.index({ code: 1, sectionId: 1 }, { unique: true });

export const CourseOffering = model<CourseOfferingDoc>('CourseOffering', courseSchema);
