import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/response';
import { auditContext, recordAudit } from '../audit/audit.service';
import * as inventory from './inventory.service';

export const list = asyncHandler(async (req, res) => {
  sendOk(res, await inventory.listInventory(req.query as unknown as inventory.InventoryQuery));
});

export const movements = asyncHandler(async (req, res) => {
  sendOk(res, await inventory.listMovements(req.query as never));
});

export const adjust = asyncHandler(async (req, res) => {
  await inventory.adjustStock(req.body, req.auth!.userId);
  await recordAudit({
    ...auditContext(req),
    action: 'inventory.adjust',
    resourceType: 'variant',
    resourceId: req.body.variantId,
    metadata: { productId: req.body.productId, delta: req.body.delta, reason: req.body.reason },
  });
  sendOk(res, { adjusted: true });
});
