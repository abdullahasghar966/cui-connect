import {
  NOTIFICATION_TYPES,
  type NotificationPrefs,
  OFFICES,
  type Office,
  ROLES,
  type Role,
} from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

export interface IdCard {
  /** The random code in the card's QR (see services/idcard.ts). */
  code: string;
  issue: number;
  issuedAt: Date;
  /** YYYY-MM-DD; null for faculty and staff, whose cards last while they work here. */
  validUntil: string | null;
}

export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  /** Student registration number, e.g. FA23-BCS-001. */
  regNo: string | null;
  designation: string | null;
  office: Office | null;
  departmentId: Types.ObjectId | null;
  sectionId: Types.ObjectId | null;
  isHOD: boolean;
  isCR: boolean;
  /** Incremented to revoke every issued session (deactivation, password reset). */
  tokenVersion: number;
  lastSeenAt: Date | null;
  /** Faculty: where to find them, and when they take questions. */
  officeLocation: string | null;
  officeHours: { day: number; start: string; end: string }[];
  /** Profile photo (a stored image), shown to everyone signed in. */
  photoId: Types.ObjectId | null;
  /** The current ID card; null until it is first opened (or seeded). */
  idCard: IdCard | null;
  /** Kinds of notification turned off or kept off the phone (missing on older accounts). */
  notificationPrefs?: NotificationPrefs;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, index: true },
    active: { type: Boolean, default: true },
    regNo: { type: String, default: null, uppercase: true, trim: true },
    designation: { type: String, default: null, trim: true },
    office: { type: String, enum: [...OFFICES, null], default: null },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section', default: null, index: true },
    isHOD: { type: Boolean, default: false },
    isCR: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0 },
    lastSeenAt: { type: Date, default: null },
    officeLocation: { type: String, default: null, trim: true },
    officeHours: { type: [{ _id: false, day: Number, start: String, end: String }], default: [] },
    photoId: { type: Schema.Types.ObjectId, ref: 'StoredFile', default: null },
    idCard: {
      type: new Schema<IdCard>(
        {
          code: { type: String, required: true },
          issue: { type: Number, required: true },
          issuedAt: { type: Date, required: true },
          validUntil: { type: String, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    notificationPrefs: {
      type: new Schema<NotificationPrefs>(
        {
          off: { type: [{ type: String, enum: NOTIFICATION_TYPES }], default: [] },
          appOnly: { type: [{ type: String, enum: NOTIFICATION_TYPES }], default: [] },
          directMessagePush: { type: Boolean, default: true },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
  },
  { timestamps: true },
);

userSchema.index(
  { regNo: 1 },
  { unique: true, partialFilterExpression: { regNo: { $type: 'string' } } },
);

userSchema.index(
  { 'idCard.code': 1 },
  { unique: true, partialFilterExpression: { 'idCard.code': { $type: 'string' } } },
);

export const User = model<UserDoc>('User', userSchema);
