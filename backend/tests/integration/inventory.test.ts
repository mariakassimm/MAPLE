import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { adjustStock, commitStock, releaseStock, reserveStock } from '../../src/modules/inventory/inventory.service';
import { InventoryMovement } from '../../src/modules/inventory/inventoryMovement.model';
import { Product } from '../../src/modules/products/product.model';
import { adminClient, makeCategory, makeProduct, type AdminClient } from '../factories';
import { clearDb, createUser, startTestDb, stopTestDb } from '../helpers';

const app = createApp();

describe('inventory', () => {
  let admin: AdminClient;
  let categoryId: string;

  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearDb();
    admin = await adminClient(app);
    categoryId = (await makeCategory(admin)).id;
  });

  const state = async (productId: string, index = 0) => {
    const p = await Product.findById(productId).lean();
    const v = p!.variants[index]!;
    return { stock: v.stock, reserved: v.reserved };
  };
  const line = (p: { id: string; variants: { id: string }[] }, quantity: number, index = 0) => ({ productId: p.id, variantId: p.variants[index]!.id, quantity });

  describe('atomic reservation', () => {
    it('never oversells when many shoppers race for the last units', async () => {
      const p = await makeProduct(admin, categoryId, { name: 'Last Units', variants: [{ sku: 'LAST-1', stock: 3 }] });
      const results = await Promise.allSettled(Array.from({ length: 12 }, () => reserveStock([line(p, 1)])));
      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(ok).toHaveLength(3);
      expect(failed).toHaveLength(9);
      expect(failed.every((f) => f.reason.code === 'INSUFFICIENT_STOCK')).toBe(true);
      expect(await state(p.id)).toEqual({ stock: 0, reserved: 3 });
    });

    it('rolls back earlier lines when a later line cannot be reserved', async () => {
      const p = await makeProduct(admin, categoryId, { name: 'Pair', variants: [{ sku: 'PAIR-A', stock: 5 }, { sku: 'PAIR-B', stock: 1 }] });
      await expect(reserveStock([line(p, 2, 0), line(p, 2, 1)])).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
      expect(await state(p.id, 0)).toEqual({ stock: 5, reserved: 0 });
      expect(await state(p.id, 1)).toEqual({ stock: 1, reserved: 0 });
    });

    it('merges duplicate lines for the same variant', async () => {
      const p = await makeProduct(admin, categoryId, { name: 'Dup', variants: [{ sku: 'DUP-1', stock: 3 }] });
      await expect(reserveStock([line(p, 2), line(p, 2)])).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
      await reserveStock([line(p, 1), line(p, 1)]);
      expect(await state(p.id)).toEqual({ stock: 1, reserved: 2 });
    });

    it('rejects non-positive quantities', async () => {
      const p = await makeProduct(admin, categoryId, { name: 'Qty', variants: [{ sku: 'QTY-1', stock: 3 }] });
      await expect(reserveStock([line(p, 0)])).rejects.toMatchObject({ status: 400 });
      await expect(reserveStock([line(p, 1.5)])).rejects.toMatchObject({ status: 400 });
    });

    it('refuses unpublished products and inactive variants', async () => {
      const draft = await makeProduct(admin, categoryId, { name: 'Draft', publish: false, variants: [{ sku: 'DRF-1', stock: 3 }] });
      await expect(reserveStock([line(draft, 1)])).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

      const live = await makeProduct(admin, categoryId, { name: 'Live', variants: [{ sku: 'LIV-1', stock: 3 }, { sku: 'LIV-2', stock: 3 }] });
      await admin.patch(`/admin/products/${live.id}/variants/${live.variants[1]!.id}`, { isActive: false });
      await expect(reserveStock([line(live, 1, 1)])).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
      await expect(reserveStock([{ productId: live.id, variantId: '0'.repeat(24), quantity: 1 }])).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    });

    it('lets backorder products be reserved beyond stock', async () => {
      const p = await makeProduct(admin, categoryId, { name: 'Made To Order', allowBackorder: true, variants: [{ sku: 'MTO-1', stock: 0 }] });
      await reserveStock([line(p, 2)]);
      expect(await state(p.id)).toEqual({ stock: -2, reserved: 2 });
    });
  });

  describe('release and commit', () => {
    it('returns released stock to sellable and commits reservations', async () => {
      const p = await makeProduct(admin, categoryId, { name: 'Flow', variants: [{ sku: 'FLOW-1', stock: 5 }] });
      await reserveStock([line(p, 3)], { reason: 'checkout' });
      await releaseStock([line(p, 1)]);
      expect(await state(p.id)).toEqual({ stock: 3, reserved: 2 });
      await commitStock([line(p, 2)]);
      expect(await state(p.id)).toEqual({ stock: 3, reserved: 0 });
    });

    it('cannot release or commit more than is reserved', async () => {
      const p = await makeProduct(admin, categoryId, { name: 'Guard', variants: [{ sku: 'GRD-1', stock: 5 }] });
      await reserveStock([line(p, 1)]);
      await expect(releaseStock([line(p, 2)])).rejects.toMatchObject({ status: 409 });
      await expect(commitStock([line(p, 2)])).rejects.toMatchObject({ status: 409 });
      expect(await state(p.id)).toEqual({ stock: 4, reserved: 1 });
    });

    it('keeps a full movement history', async () => {
      const p = await makeProduct(admin, categoryId, { name: 'Ledger', variants: [{ sku: 'LED-1', stock: 5 }] });
      await reserveStock([line(p, 2)]);
      await commitStock([line(p, 2)]);
      const types = (await InventoryMovement.find().sort({ createdAt: 1, _id: 1 }).lean()).map((m) => m.type);
      expect(types).toEqual(['initial', 'reserve', 'commit']);
    });
  });

  describe('admin adjustments', () => {
    it('adjusts stock with a reason, records history, and blocks negative results', async () => {
      const p = await makeProduct(admin, categoryId, { name: 'Adjust', variants: [{ sku: 'ADJ-1', stock: 3 }] });
      const body = (delta: number, reason = 'Stock count correction') => ({ productId: p.id, variantId: p.variants[0]!.id, delta, reason });

      expect((await admin.post('/admin/inventory/adjustments', body(10))).status).toBe(200);
      expect((await admin.post('/admin/inventory/adjustments', body(-4))).status).toBe(200);
      expect(await state(p.id)).toEqual({ stock: 9, reserved: 0 });

      expect((await admin.post('/admin/inventory/adjustments', body(-10))).status).toBe(409);
      expect((await admin.post('/admin/inventory/adjustments', body(0))).status).toBe(400);
      expect((await admin.post('/admin/inventory/adjustments', body(1, 'x'))).status).toBe(400);
      expect(await state(p.id)).toEqual({ stock: 9, reserved: 0 });

      const history = await admin.get(`/admin/inventory/movements?variantId=${p.variants[0]!.id}`);
      const rows = history.body.data.items as { type: string; stockDelta: number; stockAfter: number; reason: string | null; actorId: string | null }[];
      expect(rows.map((r) => [r.type, r.stockDelta, r.stockAfter])).toEqual([['adjustment', -4, 9], ['adjustment', 10, 13], ['initial', 3, 3]]);
      expect(rows[0]!.reason).toBe('Stock count correction');
      expect(rows[0]!.actorId).toBeTruthy();
    });

    it('reports low-stock variants and clears them after restocking', async () => {
      const p = await makeProduct(admin, categoryId, { name: 'Low', variants: [{ sku: 'LOW-1', stock: 3 }, { sku: 'LOW-2', stock: 50 }] });
      const low = await admin.get('/admin/inventory?lowStock=true');
      expect((low.body.data.items as { sku: string }[]).map((i) => i.sku)).toEqual(['LOW-1']);
      await adjustStock({ productId: p.id, variantId: p.variants[0]!.id, delta: 10, reason: 'Restock delivery' }, 'a'.repeat(24));
      expect((await admin.get('/admin/inventory?lowStock=true')).body.data.items).toEqual([]);
      const all = await admin.get('/admin/inventory?q=low');
      expect(all.body.data.pagination.total).toBe(2);
      expect(all.body.data.items[0]).toMatchObject({ available: 13, reserved: 0, onHand: 13 });
    });

    it('enforces inventory permissions', async () => {
      const om = await adminClient(app, 'om@example.com', 'order_manager');
      expect((await om.get('/admin/inventory')).status).toBe(200);
      expect((await om.post('/admin/inventory/adjustments', { productId: '0'.repeat(24), variantId: '0'.repeat(24), delta: 1, reason: 'Nope nope' })).status).toBe(403);
      const support = await adminClient(app, 'support@example.com', 'support_staff');
      expect((await support.get('/admin/inventory')).status).toBe(403);
      await createUser({ email: 'c@example.com' });
    });
  });
});
