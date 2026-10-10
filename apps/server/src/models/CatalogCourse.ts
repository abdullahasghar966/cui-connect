import { model, Schema, type Types } from 'mongoose';

/**
 * A course in the university catalog (what CSC337 is). A {@link CourseOffering} is one
 * section taking it in one term; offerings refer to the catalog by `code`.
 */
export interface CatalogCourseDoc {
  _id: Types.ObjectId;
  code: string;
  title: string;
  departmentId: Types.ObjectId | null;
  credits: number;
  labCredits: number;
  description: string | null;
  prerequisites: string[];
  clos: { code: string; text: string }[];
  outline: { week: number; topic: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const catalogCourseSchema = new Schema<CatalogCourseDoc>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    credits: { type: Number, required: true, default: 3 },
    labCredits: { type: Number, default: 0 },
    description: { type: String, default: null, trim: true },
    prerequisites: { type: [String], default: [] },
    clos: { type: [{ _id: false, code: String, text: String }], default: [] },
    outline: { type: [{ _id: false, week: Number, topic: String }], default: [] },
  },
  { timestamps: true },
);

catalogCourseSchema.index({ title: 'text', code: 'text', description: 'text' });

export const CatalogCourse = model<CatalogCourseDoc>('CatalogCourse', catalogCourseSchema);
