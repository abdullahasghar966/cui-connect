import { OFFICES, type Office, ROLES, type Role } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

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
  },
  { timestamps: true },
);

userSchema.index(
  { regNo: 1 },
  { unique: true, partialFilterExpression: { regNo: { $type: 'string' } } },
);

export const User = model<UserDoc>('User', userSchema);
