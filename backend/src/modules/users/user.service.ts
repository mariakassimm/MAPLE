import bcrypt from 'bcryptjs';
import { AppError, isDuplicateKeyError } from '../../common/errors';
import { env } from '../../config/env';
import { User, type IUser, type UserDocument } from './user.model';

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, env.BCRYPT_COST);

type NewUser = Pick<IUser, 'name' | 'email' | 'role'> & { phone?: string; password: string };

export async function insertUser({ password, ...rest }: NewUser): Promise<UserDocument> {
  const passwordHash = await hashPassword(password);
  try {
    return await User.create({ ...rest, passwordHash });
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(409, 'CONFLICT', 'An account with this email already exists.');
    throw err;
  }
}
