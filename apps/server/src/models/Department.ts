import { model, Schema, type Types } from 'mongoose';

export interface DepartmentDoc {
  _id: Types.ObjectId;
  code: string;
  name: string;
  createdAt: Date;
}

const departmentSchema = new Schema<DepartmentDoc>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Department = model<DepartmentDoc>('Department', departmentSchema);
