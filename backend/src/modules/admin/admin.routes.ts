import { Router } from 'express';
import { idParamSchema } from '../../common/validators';
import { requireAuth, requirePermission, requireStaff } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { auditAdminRouter } from '../audit/audit.routes';
import { couponAdminRouter } from '../coupons/coupon.routes';
import { adminOrdersRouter, codAdminRouter } from '../orders/order.routes';
import { shipmentsAdminRouter } from '../shipping/shipment.routes';
import { serviceAreaAdminRouter } from '../serviceAreas/serviceArea.routes';
import { settingsAdminRouter } from '../settings/settings.routes';
import { categoryAdminRouter } from '../categories/category.routes';
import { inventoryAdminRouter } from '../inventory/inventory.routes';
import { contentAdminRouter } from '../content/content.routes';
import { customersAdminRouter } from '../customers/customer.routes';
import { mediaAdminRouter } from '../media/media.routes';
import { reportsAdminRouter } from '../reports/reports.routes';
import { newsletterAdminRouter } from '../newsletter/newsletter';
import { returnsAdminRouter } from '../returns/return.routes';
import { reviewsAdminRouter } from '../reviews/review.routes';
import { paymentsAdminRouter } from '../payments/payment.routes';
import { productAdminRouter } from '../products/product.routes';
import * as staff from './staff.controller';
import { createStaffSchema, updateStaffSchema } from './staff.schemas';

export const adminRouter = Router();

// Every admin route requires a signed-in staff member; individual routers then add a specific permission.
adminRouter.use(requireAuth, requireStaff);

const staffRouter = Router();
staffRouter.use(requirePermission('staff:manage'));
staffRouter.get('/', staff.list);
staffRouter.post('/', validate({ body: createStaffSchema }), staff.create);
staffRouter.patch('/:id', validate({ params: idParamSchema, body: updateStaffSchema }), staff.update);

adminRouter.use('/staff', staffRouter);
adminRouter.use('/audit', auditAdminRouter);
adminRouter.use('/categories', categoryAdminRouter);
adminRouter.use('/products', productAdminRouter);
adminRouter.use('/inventory', inventoryAdminRouter);
adminRouter.use('/orders', adminOrdersRouter);
adminRouter.use('/cod', codAdminRouter);
adminRouter.use(shipmentsAdminRouter);
adminRouter.use('/coupons', couponAdminRouter);
adminRouter.use('/settings', settingsAdminRouter);
adminRouter.use('/payments', paymentsAdminRouter);
adminRouter.use('/reviews', reviewsAdminRouter);
adminRouter.use('/returns', returnsAdminRouter);
adminRouter.use('/newsletter', newsletterAdminRouter);
adminRouter.use('/customers', customersAdminRouter);
adminRouter.use('/media', mediaAdminRouter);
adminRouter.use(reportsAdminRouter);
adminRouter.use(contentAdminRouter);
adminRouter.use('/service-areas', serviceAreaAdminRouter);
