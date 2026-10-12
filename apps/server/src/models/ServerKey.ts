import { model, Schema, type Types } from 'mongoose';

/**
 * Key pairs the server generates for itself on first use (e.g. the VAPID keys that sign push
 * notifications). They identify the server, not campus data, so a demo reseed keeps them.
 */
export interface ServerKeyDoc {
  _id: Types.ObjectId;
  name: string;
  publicKey: string;
  privateKey: string;
  createdAt: Date;
}

const serverKeySchema = new Schema<ServerKeyDoc>(
  {
    name: { type: String, required: true, unique: true },
    publicKey: { type: String, required: true },
    privateKey: { type: String, required: true, select: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const ServerKey = model<ServerKeyDoc>('ServerKey', serverKeySchema);
