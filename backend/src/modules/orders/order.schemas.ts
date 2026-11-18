import { z } from 'zod';
import { PROVINCES } from '../../common/geo';
import { couponCodeSchema, emailSchema, nameSchema, objectIdSchema, pkMobileSchema } from '../../common/validators';
import { cartLineSchema } from '../cart/cart.schemas';
import { PAYMENT_METHOD_IDS } from '../payments/paymentMethods';
import { ORDER_STATUSES, PAYMENT_STATUSES } from './orderStatus';

export const placeOrderSchema = z
  .object({
    items: z.array(cartLineSchema).min(1).max(50),
    couponCode: couponCodeSchema.optional(),
    paymentMethod: z.enum(PAYMENT_METHOD_IDS),
    customer: z.object({ name: nameSchema, phone: pkMobileSchema, email: emailSchema.optional() }).strict(),
    shippingAddress: z
      .object({
        recipientName: nameSchema.optional(),
        phone: pkMobileSchema.optional(),
        province: z.enum(PROVINCES),
        city: z.string().trim().min(2).max(60),
        area: z.string().trim().min(2).max(100),
        line1: z.string().trim().min(5, 'Enter the full delivery address').max(200),
        postalCode: z
          .string()
          .trim()
          .regex(/^\d{5}$/, 'Postal code must be 5 digits')
          .optional(),
        notes: z.string().trim().max(200).optional(),
      })
      .strict(),
    notes: z.string().trim().max(300).optional(),
    // If the total the shopper saw no longer matches, the server refuses and returns the new one (FR-CART-007).
    expectedTotal: z.number().int().min(0).optional(),
  })
  .strict();

export const trackOrderSchema = z
  .object({
    orderNumber: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^MPL-[A-Z0-9]{8}$/, 'Invalid order number'),
    phone: pkMobileSchema,
  })
  .strict();

export const orderNumberParamSchema = z
  .object({
    orderNumber: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^MPL-[A-Z0-9]{8}$/),
  })
  .strict();

const paging = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const accountOrdersQuerySchema = z.object(paging);

export const adminOrdersQuerySchema = z.object({
  ...paging,
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  paymentMethod: z.enum(PAYMENT_METHOD_IDS).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const updateStatusSchema = z
  .object({ status: z.enum(ORDER_STATUSES), reason: z.string().trim().min(3).max(200).optional() })
  .strict()
  .refine((v) => v.status !== 'cancelled' || !!v.reason, {
    message: 'A reason is required to cancel an order',
    path: ['reason'],
  });

export const orderIdParamSchema = z.object({ id: objectIdSchema }).strict();

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;

export const cancelOrderSchema = z.object({ reason: z.string().trim().min(3).max(200).optional() }).strict();
export const guestCancelSchema = z
  .object({
    orderNumber: trackOrderSchema.shape.orderNumber,
    phone: pkMobileSchema,
    reason: z.string().trim().min(3).max(200).optional(),
  })
  .strict();
export const codCollectionSchema = z.object({ amount: z.number().int().min(1).max(100_000_000) }).strict();
export const codRemittanceSchema = z
  .object({
    amount: z.number().int().min(0).max(100_000_000),
    courierCharges: z.number().int().min(0).max(100_000_000).default(0),
    reference: z.string().trim().min(3).max(60),
  })
  .strict();
