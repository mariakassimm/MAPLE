import { Schema, model, type HydratedDocument } from 'mongoose';
import { ROLES, type Role } from '../../common/permissions';

export interface IUser {
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: Role;
  status: 'active' | 'suspended';
  emailVerified: boolean;
  failedLoginCount: number;
  lockUntil?: Date | null;
  lastLoginAt?: Date;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
  emailVerificationTokenHash?: string;
  emailVerificationExpiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserDocument = HydratedDocument<IUser>;

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, unique: true },
    phone: { type: String },
    // select:false keeps hashes and reset tokens out of every query unless explicitly requested.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: [...ROLES], default: 'customer', required: true, index: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active', required: true },
    emailVerified: { type: Boolean, default: false },
    failedLoginCount: { type: Number, default: 0 },
    lockUntil: { type: Date },
    lastLoginAt: { type: Date },
    passwordResetTokenHash: { type: String, select: false, index: true, sparse: true },
    passwordResetExpiresAt: { type: Date, select: false },
    emailVerificationTokenHash: { type: String, select: false, index: true, sparse: true },
    emailVerificationExpiresAt: { type: Date, select: false },
  },
  { timestamps: true },
);

export const User = model<IUser>('User', userSchema);

export const toPublicUser = (u: UserDocument) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  phone: u.phone ?? null,
  role: u.role,
  status: u.status,
  emailVerified: u.emailVerified,
  createdAt: u.createdAt,
});
