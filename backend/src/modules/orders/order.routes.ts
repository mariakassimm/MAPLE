import { Router } from 'express';
import { forbidStaff, requireCustomer, requirePermission } from '../../middleware/auth';
import { authLimiter, orderLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { idParamSchema } from '../../common/validators';
import * as ctrl from './order.controller';
import {
  accountOrdersQuerySchema,
  adminOrdersQuerySchema,
  cancelOrderSchema,
  codCollectionSchema,
  codRemittanceSchema,
  guestCancelSchema,
  orderNumberParamSchema,
  placeOrderSchema,
  trackOrderSchema,
  updateStatusSchema,
} from './order.schemas';

export const ordersRouter = Router();
ordersRouter.post('/', forbidStaff, orderLimiter, validate({ body: placeOrderSchema }), ctrl.place);
ordersRouter.post('/track', authLimiter, validate({ body: trackOrderSchema }), ctrl.track);
ordersRouter.post('/cancel', authLimiter, validate({ body: guestCancelSchema }), ctrl.guestCancel);

export const accountOrdersRouter = Router();
accountOrdersRouter.use(requireCustomer);
accountOrdersRouter.get('/', validate({ query: accountOrdersQuerySchema }), ctrl.accountList);
accountOrdersRouter.get('/:orderNumber', validate({ params: orderNumberParamSchema }), ctrl.accountGet);
accountOrdersRouter.post(
  '/:orderNumber/cancel',
  validate({ params: orderNumberParamSchema, body: cancelOrderSchema }),
  ctrl.accountCancel,
);

export const adminOrdersRouter = Router();
adminOrdersRouter.get(
  '/',
  requirePermission('orders:read'),
  validate({ query: adminOrdersQuerySchema }),
  ctrl.adminList,
);
adminOrdersRouter.get('/:id', requirePermission('orders:read'), validate({ params: idParamSchema }), ctrl.adminGet);
adminOrdersRouter.patch(
  '/:id/status',
  requirePermission('orders:write'),
  validate({ params: idParamSchema, body: updateStatusSchema }),
  ctrl.adminUpdateStatus,
);

// Cash collected by the courier is recorded by whoever processes orders; reconciling the courier's payout to MAPLE is a
// financial action, so it needs payments:write (super admin by default). Who should own this is a business decision.
adminOrdersRouter.post(
  '/:id/cod/collection',
  requirePermission('orders:write'),
  validate({ params: idParamSchema, body: codCollectionSchema }),
  ctrl.codCollection,
);
adminOrdersRouter.post(
  '/:id/cod/remittance',
  requirePermission('payments:write'),
  validate({ params: idParamSchema, body: codRemittanceSchema }),
  ctrl.codRemittance,
);

export const codAdminRouter = Router();
codAdminRouter.get('/summary', requirePermission('payments:read'), ctrl.codSummary);
