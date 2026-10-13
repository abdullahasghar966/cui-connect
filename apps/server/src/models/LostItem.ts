import {
  ITEM_CATEGORIES,
  type ItemCategory,
  LOST_FOUND_KINDS,
  type LostFoundKind,
} from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

/** Something lost or found on campus. */
export interface LostItemDoc {
  _id: Types.ObjectId;
  kind: LostFoundKind;
  title: string;
  category: ItemCategory;
  description: string | null;
  place: string;
  /** Campus date it was lost or found. */
  date: string;
  photoId: Types.ObjectId | null;
  reporterId: Types.ObjectId;
  resolvedAt: Date | null;
  resolvedById: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const lostItemSchema = new Schema<LostItemDoc>(
  {
    kind: { type: String, enum: LOST_FOUND_KINDS, required: true },
    title: { type: String, required: true, trim: true },
    category: { type: String, enum: ITEM_CATEGORIES, required: true },
    description: { type: String, default: null },
    place: { type: String, required: true },
    date: { type: String, required: true },
    photoId: { type: Schema.Types.ObjectId, ref: 'StoredFile', default: null },
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    resolvedAt: { type: Date, default: null },
    resolvedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

lostItemSchema.index({ resolvedAt: 1, createdAt: -1 });
lostItemSchema.index({ reporterId: 1 });

export const LostItem = model<LostItemDoc>('LostItem', lostItemSchema);

/** "This is mine" (for a found item) or "I found it" (for a lost one). */
export interface LostClaimDoc {
  _id: Types.ObjectId;
  itemId: Types.ObjectId;
  userId: Types.ObjectId;
  message: string;
  accepted: boolean;
  createdAt: Date;
}

const lostClaimSchema = new Schema<LostClaimDoc>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: 'LostItem', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    accepted: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

lostClaimSchema.index({ itemId: 1, userId: 1 }, { unique: true });

export const LostClaim = model<LostClaimDoc>('LostClaim', lostClaimSchema);
