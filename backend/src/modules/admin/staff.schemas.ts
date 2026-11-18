import { z } from 'zod';
import { ASSIGNABLE_STAFF_ROLES } from '../../common/permissions';
import { emailSchema, nameSchema, passwordSchema, pkMobileSchema } from '../../common/validators';

const roleSchema = z.enum(ASSIGNABLE_STAFF_ROLES);

export const createStaffSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    phone: pkMobileSchema.optional(),
    password: passwordSchema,
    role: roleSchema,
  })
  .strict();

export const updateStaffSchema = z
  .object({ role: roleSchema.optional(), status: z.enum(['active', 'suspended']).optional() })
  .strict()
  .refine((v) => v.role !== undefined || v.status !== undefined, 'Provide a role or a status');
