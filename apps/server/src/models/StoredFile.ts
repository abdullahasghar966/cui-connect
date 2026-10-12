import { FILE_PURPOSES, type FilePurpose } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

/**
 * An uploaded file. The bytes live in GridFS (bucket `files`, same `_id`); this record says who
 * owns it, which course it belongs to and what it's attached to, which decides who may download it.
 */
export interface StoredFileDoc {
  _id: Types.ObjectId;
  name: string;
  size: number;
  /** Served type, from the extension. */
  type: string;
  ownerId: Types.ObjectId;
  purpose: FilePurpose;
  offeringId: Types.ObjectId;
  /** The assignment, submission or material it belongs to; null until then (only the owner sees it). */
  attachedTo: Types.ObjectId | null;
  createdAt: Date;
}

const storedFileSchema = new Schema<StoredFileDoc>(
  {
    name: { type: String, required: true },
    size: { type: Number, required: true },
    type: { type: String, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: FILE_PURPOSES, required: true },
    offeringId: { type: Schema.Types.ObjectId, ref: 'CourseOffering', required: true },
    attachedTo: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

storedFileSchema.index({ ownerId: 1 });
storedFileSchema.index({ attachedTo: 1, createdAt: 1 });

export const StoredFile = model<StoredFileDoc>('StoredFile', storedFileSchema);
