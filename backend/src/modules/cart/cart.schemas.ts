import { z } from 'zod';
import { couponCodeSchema, objectIdSchema } from '../../common/validators';

export const cartLineSchema = z
  .object({ variantId: objectIdSchema, quantity: z.number().int().min(1).max(99) })
  .strict();

export const priceCartSchema = z
  .object({ items: z.array(cartLineSchema).max(50), couponCode: couponCodeSchema.optional() })
  .strict();
export const saveCartSchema = priceCartSchema;
export const getCartQuerySchema = z.object({ couponCode: couponCodeSchema.optional() });
