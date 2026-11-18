import { Router } from 'express';
import { attachAuth } from './middleware/auth';
import { adminRouter } from './modules/admin/admin.routes';
import { authRouter } from './modules/auth/auth.routes';
import { accountRouter } from './modules/account/account.routes';
import { cartRouter } from './modules/cart/cart.routes';
import { checkoutRouter } from './modules/checkout/checkout.routes';
import { accountOrdersRouter, ordersRouter } from './modules/orders/order.routes';
import { categoryPublicRouter } from './modules/categories/category.routes';
import { healthRouter } from './modules/health/health.routes';
import { contentPublicRouter } from './modules/content/content.routes';
import { seoRouter } from './modules/seo/seo.routes';
import { newsletterRouter } from './modules/newsletter/newsletter';
import { accountReturnsRouter, returnsRouter } from './modules/returns/return.routes';
import { reviewsAccountRouter, reviewsPublicRouter } from './modules/reviews/review.routes';
import { paymentsRouter } from './modules/payments/payment.routes';
import { productPublicRouter } from './modules/products/product.routes';

export function buildV1Router(): Router {
  const router = Router();
  // Health sits before attachAuth so uptime probes never touch the database.
  router.use('/health', healthRouter);
  // Public catalogue is anonymous and cacheable, so it also skips session lookups.
  router.use('/categories', categoryPublicRouter);
  router.use('/products', reviewsPublicRouter);
  router.use('/products', productPublicRouter);
  router.use('/newsletter', newsletterRouter);
  router.use('/content', contentPublicRouter);
  router.use('/seo', seoRouter);
  // Provider callbacks and the guest payment-start endpoint: not cookie-authenticated, so they sit above attachAuth.
  router.use('/payments', paymentsRouter);
  // Provider webhooks (payments, couriers) must be mounted here, above attachAuth, with their own
  // signature verification and raw-body parsing; they are not cookie-authenticated.
  router.use(attachAuth);
  router.use('/auth', authRouter);
  router.use('/cart', cartRouter);
  router.use('/checkout', checkoutRouter);
  router.use('/orders', ordersRouter);
  router.use('/account/orders', accountOrdersRouter);
  router.use('/account/reviews', reviewsAccountRouter);
  router.use('/account/returns', accountReturnsRouter);
  router.use('/account', accountRouter);
  router.use('/returns', returnsRouter);
  router.use('/admin', adminRouter);
  return router;
}
