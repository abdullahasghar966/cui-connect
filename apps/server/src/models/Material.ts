import { model, Schema, type Types } from 'mongoose';

/** A course material for one week: an uploaded file or a link. */
export interface MaterialDoc {
  _id: Types.ObjectId;
  offeringId: Types.ObjectId;
  week: number;
  title: string;
  description: string | null;
  fileId: Types.ObjectId | null;
  url: string | null;
  createdById: Types.ObjectId;
  createdAt: Date;
}

const materialSchema = new Schema<MaterialDoc>(
  {
    offeringId: { type: Schema.Types.ObjectId, ref: 'CourseOffering', required: true },
    week: { type: Number, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    fileId: { type: Schema.Types.ObjectId, default: null },
    url: { type: String, default: null },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

materialSchema.index({ offeringId: 1, week: 1 });

export const Material = model<MaterialDoc>('Material', materialSchema);
