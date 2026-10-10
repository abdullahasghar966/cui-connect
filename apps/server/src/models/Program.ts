import { model, Schema, type Types } from 'mongoose';

/** A degree programme (e.g. BCS) and its recommended courses per semester. */
export interface ProgramDoc {
  _id: Types.ObjectId;
  code: string;
  name: string;
  departmentId: Types.ObjectId;
  totalCredits: number;
  plan: { semester: number; courses: string[] }[];
  createdAt: Date;
  updatedAt: Date;
}

const programSchema = new Schema<ProgramDoc>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
    totalCredits: { type: Number, required: true },
    plan: { type: [{ _id: false, semester: Number, courses: [String] }], default: [] },
  },
  { timestamps: true },
);

export const Program = model<ProgramDoc>('Program', programSchema);
