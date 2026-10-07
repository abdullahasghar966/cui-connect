import { MEMBER_ROLES, type MemberRole } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

export type MembershipSource = 'auto' | 'manual';

export interface MembershipDoc {
  _id: Types.ObjectId;
  groupId: Types.ObjectId;
  userId: Types.ObjectId;
  role: MemberRole;
  /** `auto` memberships are reconciled from university structure; `manual` ones were added by a person. */
  source: MembershipSource;
  mutedUntil: Date | null;
  lastReadMessageId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const membershipSchema = new Schema<MembershipDoc>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: MEMBER_ROLES, default: 'member' },
    source: { type: String, enum: ['auto', 'manual'], default: 'manual' },
    mutedUntil: { type: Date, default: null },
    lastReadMessageId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

membershipSchema.index({ groupId: 1, userId: 1 }, { unique: true });

export const Membership = model<MembershipDoc>('Membership', membershipSchema);
