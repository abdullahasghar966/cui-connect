import { JOB_KINDS, type JobKind } from '@cui/shared';
import { model, Schema, type Types } from 'mongoose';

/** A job or internship posted by Student Affairs (or IT) for students. */
export interface JobPostDoc {
  _id: Types.ObjectId;
  title: string;
  company: string;
  kind: JobKind;
  location: string;
  description: string;
  applyUrl: string | null;
  applyEmail: string | null;
  /** Campus date; the post hides after it. */
  deadline: string;
  programs: string[];
  postedById: Types.ObjectId;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const jobPostSchema = new Schema<JobPostDoc>(
  {
    title: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    kind: { type: String, enum: JOB_KINDS, required: true },
    location: { type: String, required: true },
    description: { type: String, required: true },
    applyUrl: { type: String, default: null },
    applyEmail: { type: String, default: null },
    deadline: { type: String, required: true },
    programs: { type: [String], default: [] },
    postedById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

jobPostSchema.index({ deadline: 1, closedAt: 1 });

export const JobPost = model<JobPostDoc>('JobPost', jobPostSchema);

/** A job someone bookmarked (they hear about its deadline). */
export interface SavedJobDoc {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  userId: Types.ObjectId;
  createdAt: Date;
}

const savedJobSchema = new Schema<SavedJobDoc>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: 'JobPost', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

savedJobSchema.index({ userId: 1, jobId: 1 }, { unique: true });
savedJobSchema.index({ jobId: 1 });

export const SavedJob = model<SavedJobDoc>('SavedJob', savedJobSchema);
