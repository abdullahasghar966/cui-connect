import { model, Schema, type Types } from 'mongoose';

/** A semester such as FA26 (Fall 2026). Exactly one term is current. */
export interface TermDoc {
  _id: Types.ObjectId;
  code: string;
  name: string;
  /** Campus calendar dates, `YYYY-MM-DD`. */
  startsOn: string;
  endsOn: string;
  current: boolean;
  createdAt: Date;
}

const termSchema = new Schema<TermDoc>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    startsOn: { type: String, required: true },
    endsOn: { type: String, required: true },
    current: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// At most one current term.
termSchema.index({ current: 1 }, { unique: true, partialFilterExpression: { current: true } });

export const Term = model<TermDoc>('Term', termSchema);
