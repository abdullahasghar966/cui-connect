import {
  GROUP_TYPES,
  type GroupSettings,
  type GroupType,
  JOIN_POLICIES,
  POST_POLICIES,
  ROLES,
} from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

export interface GroupDoc {
  _id: Types.ObjectId;
  name: string;
  description: string | null;
  type: GroupType;
  /** Created by provisioning from university structure; can't be deleted or renamed. */
  system: boolean;
  /**
   * Stable identity for provisioned groups and DMs, e.g. `SECTION:<id>` or `DM:<a>:<b>`.
   * Makes provisioning idempotent and prevents duplicate DM threads.
   */
  key: string | null;
  departmentId: Types.ObjectId | null;
  sectionId: Types.ObjectId | null;
  courseId: Types.ObjectId | null;
  settings: GroupSettings;
  createdById: Types.ObjectId | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const settingsSchema = new Schema<GroupSettings>(
  {
    postPolicy: { type: String, enum: POST_POLICIES, default: 'all' },
    allowedPosterRoles: { type: [{ type: String, enum: ROLES }], default: [] },
    eligibleRoles: { type: [{ type: String, enum: ROLES }], default: [] },
    locked: { type: Boolean, default: false },
    joinPolicy: { type: String, enum: JOIN_POLICIES, default: 'invite' },
  },
  { _id: false },
);

const groupSchema = new Schema<GroupDoc>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null, trim: true },
    type: { type: String, enum: GROUP_TYPES, required: true, index: true },
    system: { type: Boolean, default: false },
    key: { type: String, default: null },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section', default: null },
    courseId: { type: Schema.Types.ObjectId, ref: 'CourseOffering', default: null },
    settings: { type: settingsSchema, required: true },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true },
);

groupSchema.index(
  { key: 1 },
  { unique: true, partialFilterExpression: { key: { $type: 'string' } } },
);

export const Group = model<GroupDoc>('Group', groupSchema);
