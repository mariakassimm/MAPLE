import { Schema, model, type Types } from 'mongoose';

export interface ISession {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  ip?: string;
  userAgent?: string;
  createdAt?: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// MongoDB removes expired sessions itself; resolveSession also checks expiry because the TTL sweep runs only about once a minute.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<ISession>('Session', sessionSchema);
