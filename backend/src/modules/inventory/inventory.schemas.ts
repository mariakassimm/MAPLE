import { z } from 'zod';
import { objectIdSchema, queryBoolean } from '../../common/validators';

export const adjustmentSchema = z
  .object({
    productId: objectIdSchema,
    variantId: objectIdSchema,
    delta: z
      .number()
      .int()
      .min(-100_000)
      .max(100_000)
      .refine((n) => n !== 0, 'Delta cannot be zero'),
    reason: z.string().trim().min(3, 'A reason is required').max(200),
  })
  .strict();

const paging = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
};

export const inventoryQuerySchema = z.object({
  ...paging,
  lowStock: queryBoolean.optional(),
  q: z.string().trim().min(1).max(100).optional(),
});
export const movementsQuerySchema = z.object({
  ...paging,
  productId: objectIdSchema.optional(),
  variantId: objectIdSchema.optional(),
});
