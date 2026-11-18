import { z } from 'zod';
import { emailSchema, nameSchema, passwordSchema, pkMobileSchema } from '../../common/validators';

export const registerSchema = z
  .object({ name: nameSchema, email: emailSchema, phone: pkMobileSchema.optional(), password: passwordSchema })
  .strict();

// Login accepts any non-empty password: policy is enforced when setting one, not when checking one.
export const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(200), portal: z.enum(['store', 'admin']).optional() })
  .strict();

export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) }).strict();

export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();

export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema }).strict();
