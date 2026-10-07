import { model, Schema, type Types } from 'mongoose';

/** A class section such as BCS-7A (program BCS, intake FA23, 7th semester, section A). */
export interface SectionDoc {
  _id: Types.ObjectId;
  name: string;
  program: string;
  intake: string;
  departmentId: Types.ObjectId;
  batchAdvisorId: Types.ObjectId | null;
  createdAt: Date;
}

const sectionSchema = new Schema<SectionDoc>(
  {
    name: { type: String, required: true, unique: true, uppercase: true, trim: true },
    program: { type: String, required: true, uppercase: true, trim: true },
    intake: { type: String, required: true, uppercase: true, trim: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    batchAdvisorId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Section = model<SectionDoc>('Section', sectionSchema);
