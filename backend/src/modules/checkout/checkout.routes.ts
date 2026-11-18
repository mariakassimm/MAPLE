import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/asyncHandler';
import { PROVINCES } from '../../common/geo';
import { sendOk } from '../../common/response';
import { couponCodeSchema } from '../../common/validators';
import { validate } from '../../middleware/validate';
import { priceCart } from '../cart/pricing.service';
import { cartLineSchema } from '../cart/cart.schemas';
import { paymentOptions } from '../payments/paymentMethods';
import { isDemoProvider, providerAvailability } from '../payments/registry';
import { listActiveAreas, resolveServiceArea } from '../serviceAreas/serviceArea.service';
import { getSettings } from '../settings/settings.service';

const quoteSchema = z
  .object({
    items: z.array(cartLineSchema).max(50),
    couponCode: couponCodeSchema.optional(),
    province: z.enum(PROVINCES).optional(),
    city: z.string().trim().min(2).max(60).optional(),
  })
  .strict();

export const checkoutRouter = Router();

// Everything the checkout page needs in one call: priced cart, whether we deliver there, and which payment methods work.
checkoutRouter.post(
  '/quote',
  validate({ body: quoteSchema }),
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    const { cart } = await priceCart(req.body, settings);
    const area = req.body.city && req.body.province ? await resolveServiceArea(req.body.city, req.body.province) : null;
    sendOk(res, {
      cart,
      serviceability:
        req.body.city && req.body.province ? { serviceable: !!area, codAvailable: !!area?.codAvailable } : null,
      paymentMethods: paymentOptions(settings, area, cart.total, providerAvailability()).map((o) =>
        o.id !== 'cod' && isDemoProvider(o.id) ? { ...o, demo: true } : o,
      ),
    });
  }),
);

checkoutRouter.get(
  '/cities',
  asyncHandler(async (_req, res) => {
    const areas = await listActiveAreas();
    sendOk(res, { cities: areas.map((a) => ({ city: a.city, province: a.province, codAvailable: a.codAvailable })) });
  }),
);
