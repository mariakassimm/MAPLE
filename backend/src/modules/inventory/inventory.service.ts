import { Types, type PipelineStage } from 'mongoose';
import { AppError } from '../../common/errors';
import { pageMeta } from '../../common/pagination';
import { escapeRegex } from '../../common/text';
import { logger } from '../../config/logger';
import { Product } from '../products/product.model';
import { InventoryMovement, type MovementType } from './inventoryMovement.model';

export interface StockLine {
  productId: string;
  variantId: string;
  quantity: number;
}

export interface MovementContext {
  actorId?: string;
  orderId?: string;
  reason?: string;
}

const oid = (id: string) => new Types.ObjectId(id);

function mergeLines(lines: StockLine[]): StockLine[] {
  const merged = new Map<string, StockLine>();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new AppError(400, 'BAD_REQUEST', 'Quantity must be a positive whole number.');
    }
    const existing = merged.get(line.variantId);
    if (existing) existing.quantity += line.quantity;
    else merged.set(line.variantId, { ...line });
  }
  return [...merged.values()];
}

interface MutateOptions {
  line: StockLine;
  stockDelta: number;
  reservedDelta: number;
  /** Extra condition the variant must satisfy at the moment of the update (e.g. enough stock). */
  condition: Record<string, unknown>;
  type: MovementType;
  ctx: MovementContext;
  failure: AppError;
  /** Reserving needs a published product and an active variant. */
  requireSellable?: boolean;
  /** Backorder products skip the stock condition (but still need a sellable variant). */
  backorderBypass?: boolean;
}

// Every stock change is ONE conditional update on ONE document. MongoDB applies it atomically, so two
// shoppers racing for the last unit cannot both succeed; no read-then-write window exists.
async function mutate(o: MutateOptions): Promise<void> {
  const productId = oid(o.line.productId);
  const variantId = oid(o.line.variantId);

  const sellable = o.requireSellable ? { isActive: true } : {};
  const match: Record<string, unknown> = { _id: productId };
  if (o.requireSellable) match.status = 'published';

  if (o.backorderBypass) {
    match.$or = [
      { allowBackorder: true, variants: { $elemMatch: { _id: variantId, ...sellable } } },
      { variants: { $elemMatch: { _id: variantId, ...sellable, ...o.condition } } },
    ];
  } else {
    match.variants = { $elemMatch: { _id: variantId, ...sellable, ...o.condition } };
  }

  const after = await Product.findOneAndUpdate(
    match,
    { $inc: { 'variants.$[v].stock': o.stockDelta, 'variants.$[v].reserved': o.reservedDelta } },
    { new: true, arrayFilters: [{ 'v._id': variantId }], projection: { variants: 1 } },
  );
  if (!after) throw o.failure;

  const variant = after.variants.find((v) => String(v._id) === o.line.variantId);
  if (!variant) throw o.failure;

  try {
    await InventoryMovement.create({
      productId,
      variantId,
      sku: variant.sku,
      type: o.type,
      stockDelta: o.stockDelta,
      reservedDelta: o.reservedDelta,
      stockAfter: variant.stock,
      reservedAfter: variant.reserved,
      reason: o.ctx.reason,
      actorId: o.ctx.actorId ? oid(o.ctx.actorId) : undefined,
      orderId: o.ctx.orderId ? oid(o.ctx.orderId) : undefined,
    });
  } catch (err) {
    // Stock is already correct; only the history row is missing. Surface loudly rather than undo a valid change.
    logger.error({ err, variantId: o.line.variantId, type: o.type }, 'inventory movement was not recorded');
  }
}

const insufficient = () =>
  new AppError(409, 'INSUFFICIENT_STOCK', 'One or more items are no longer available in the requested quantity.');
const mismatch = () => new AppError(409, 'CONFLICT', 'Reserved quantity does not match; nothing was changed.');

async function reserveOne(line: StockLine, ctx: MovementContext) {
  return mutate({
    line,
    stockDelta: -line.quantity,
    reservedDelta: line.quantity,
    type: 'reserve',
    ctx,
    condition: { stock: { $gte: line.quantity } },
    requireSellable: true,
    backorderBypass: true,
    failure: insufficient(),
  });
}

async function releaseOne(line: StockLine, ctx: MovementContext) {
  return mutate({
    line,
    stockDelta: line.quantity,
    reservedDelta: -line.quantity,
    type: 'release',
    ctx,
    condition: { reserved: { $gte: line.quantity } },
    failure: mismatch(),
  });
}

/** Holds stock for a checkout. All-or-nothing: if any line fails, lines already held are released again. */
export async function reserveStock(lines: StockLine[], ctx: MovementContext = {}): Promise<void> {
  const merged = mergeLines(lines);
  const held: StockLine[] = [];
  try {
    for (const line of merged) {
      await reserveOne(line, ctx);
      held.push(line);
    }
  } catch (err) {
    // Compensation instead of a transaction, so this also works on a standalone MongoDB.
    for (const line of held) {
      await releaseOne(line, { ...ctx, reason: 'rollback after failed reservation' }).catch((e) =>
        logger.error({ err: e, variantId: line.variantId }, 'failed to roll back stock reservation'),
      );
    }
    throw err;
  }
}

/** Returns held stock to sellable (payment failed, order cancelled, reservation expired). */
export async function releaseStock(lines: StockLine[], ctx: MovementContext = {}): Promise<void> {
  for (const line of mergeLines(lines)) await releaseOne(line, ctx);
}

/** Makes a reservation final once the order is confirmed: the held units leave inventory. */
export async function commitStock(lines: StockLine[], ctx: MovementContext = {}): Promise<void> {
  for (const line of mergeLines(lines)) {
    await mutate({
      line,
      stockDelta: 0,
      reservedDelta: -line.quantity,
      type: 'commit',
      ctx,
      condition: { reserved: { $gte: line.quantity } },
      failure: mismatch(),
    });
  }
}

/** Puts committed units back on sale, e.g. an order cancelled before it left the warehouse. */
export async function restockStock(
  lines: StockLine[],
  ctx: MovementContext = {},
  type: MovementType = 'restock',
): Promise<void> {
  for (const line of mergeLines(lines)) {
    await mutate({
      line,
      stockDelta: line.quantity,
      reservedDelta: 0,
      type,
      ctx,
      condition: {},
      failure: new AppError(404, 'NOT_FOUND', 'Variant not found for restock.'),
    });
  }
}

export async function adjustStock(
  input: { productId: string; variantId: string; delta: number; reason: string },
  actorId: string,
): Promise<void> {
  const quantity = Math.abs(input.delta);
  await mutate({
    line: { productId: input.productId, variantId: input.variantId, quantity },
    stockDelta: input.delta,
    reservedDelta: 0,
    // Manual removals may not push available stock below zero; that would silently oversell.
    condition: input.delta < 0 ? { stock: { $gte: quantity } } : {},
    type: 'adjustment',
    ctx: { actorId, reason: input.reason },
    failure: new AppError(
      409,
      'INSUFFICIENT_STOCK',
      'Adjustment would make available stock negative, or the variant was not found.',
    ),
  });
}

/** Used by product creation to log opening stock. */
export async function recordInitialStock(
  product: { _id: Types.ObjectId },
  variant: { _id: Types.ObjectId; sku: string; stock: number },
  actorId: string,
): Promise<void> {
  if (variant.stock <= 0) return;
  await InventoryMovement.create({
    productId: product._id,
    variantId: variant._id,
    sku: variant.sku,
    type: 'initial',
    stockDelta: variant.stock,
    reservedDelta: 0,
    stockAfter: variant.stock,
    reservedAfter: 0,
    reason: 'Opening stock',
    actorId: oid(actorId),
  });
}

export interface InventoryQuery {
  page: number;
  limit: number;
  lowStock?: boolean;
  q?: string;
}

export async function listInventory(query: InventoryQuery) {
  const pipeline: PipelineStage[] = [{ $match: { status: { $ne: 'archived' } } }, { $unwind: '$variants' }];
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    pipeline.push({ $match: { $or: [{ name: rx }, { 'variants.sku': rx }] } });
  }
  if (query.lowStock) {
    pipeline.push({
      $match: { 'variants.isActive': true, $expr: { $lte: ['$variants.stock', '$variants.lowStockThreshold'] } },
    });
  }
  pipeline.push(
    { $sort: { 'variants.stock': 1, name: 1, 'variants._id': 1 } },
    {
      $facet: {
        items: [
          { $skip: (query.page - 1) * query.limit },
          { $limit: query.limit },
          {
            $project: {
              _id: 0,
              productId: '$_id',
              productName: '$name',
              productStatus: '$status',
              variantId: '$variants._id',
              sku: '$variants.sku',
              options: '$variants.options',
              isActive: '$variants.isActive',
              available: '$variants.stock',
              reserved: '$variants.reserved',
              onHand: { $add: ['$variants.stock', '$variants.reserved'] },
              lowStockThreshold: '$variants.lowStockThreshold',
              isLow: { $lte: ['$variants.stock', '$variants.lowStockThreshold'] },
            },
          },
        ],
        total: [{ $count: 'n' }],
      },
    },
  );
  const [result] = await Product.aggregate<{ items: unknown[]; total: { n: number }[] }>(pipeline);
  const total = result?.total[0]?.n ?? 0;
  return { items: result?.items ?? [], pagination: pageMeta(query.page, query.limit, total) };
}

export async function listMovements(query: { page: number; limit: number; productId?: string; variantId?: string }) {
  const filter: Record<string, unknown> = {};
  if (query.productId) filter.productId = oid(query.productId);
  if (query.variantId) filter.variantId = oid(query.variantId);
  const [items, total] = await Promise.all([
    InventoryMovement.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    InventoryMovement.countDocuments(filter),
  ]);
  return {
    items: items.map((m) => ({
      id: String(m._id),
      productId: String(m.productId),
      variantId: String(m.variantId),
      sku: m.sku,
      type: m.type,
      stockDelta: m.stockDelta,
      reservedDelta: m.reservedDelta,
      stockAfter: m.stockAfter,
      reservedAfter: m.reservedAfter,
      reason: m.reason ?? null,
      actorId: m.actorId ? String(m.actorId) : null,
      orderId: m.orderId ? String(m.orderId) : null,
      createdAt: m.createdAt,
    })),
    pagination: pageMeta(query.page, query.limit, total),
  };
}
