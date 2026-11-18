import type { Types } from 'mongoose';
import type { IImage } from '../../common/image';
import { effectivePrice, isOnSale } from '../../common/money';
import { Category } from '../categories/category.model';
import { evaluateCoupon, failureMessage } from '../coupons/coupon.service';
import { Product, type IVariant, type ProductLean } from '../products/product.model';
import type { ISettings } from '../settings/settings.model';
import { getSettings } from '../settings/settings.service';

export interface CartInputLine {
  variantId: string;
  quantity: number;
}

export interface PricedLine {
  variantId: string;
  productId: string | null;
  productSlug: string | null;
  sku: string | null;
  name: string | null;
  options: { name: string; value: string }[];
  image: IImage | null;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  lineTotal: number;
  status: 'ok' | 'unavailable' | 'insufficient_stock';
  /** Largest quantity the shopper can currently buy for this line. */
  availableQuantity: number | null;
}

export interface PricedCart {
  currency: 'PKR';
  lines: PricedLine[];
  subtotal: number;
  discount: number;
  coupon: { code: string; valid: boolean; message: string | null } | null;
  shippingFee: number;
  total: number;
  freeShippingRemaining: number | null;
  canCheckout: boolean;
}

export const mergeLines = (items: CartInputLine[]): CartInputLine[] => {
  const merged = new Map<string, number>();
  for (const { variantId, quantity } of items) merged.set(variantId, (merged.get(variantId) ?? 0) + quantity);
  return [...merged].map(([variantId, quantity]) => ({ variantId, quantity }));
};

export function computeShipping(
  settings: Pick<ISettings, 'shipping'>,
  subtotalAfterDiscount: number,
  hasPayableLines: boolean,
): number {
  if (!hasPayableLines) return 0;
  const threshold = settings.shipping.freeShippingThreshold;
  return threshold != null && subtotalAfterDiscount >= threshold ? 0 : settings.shipping.flatRate;
}

const unavailable = (variantId: string, quantity: number): PricedLine => ({
  variantId,
  productId: null,
  productSlug: null,
  sku: null,
  name: null,
  options: [],
  image: null,
  unitPrice: 0,
  compareAtPrice: null,
  quantity,
  lineTotal: 0,
  status: 'unavailable',
  availableQuantity: null,
});

/**
 * The single source of truth for what a cart costs. Every price, discount and fee is recomputed here from the
 * database; nothing the browser sends except variant ids and quantities is trusted (FR-CART-004).
 */
export async function priceCart(
  input: { items: CartInputLine[]; couponCode?: string },
  settings?: ISettings,
): Promise<{ cart: PricedCart; couponId: string | null }> {
  const s = settings ?? (await getSettings());
  const merged = mergeLines(input.items);
  const ids = merged.map((l) => l.variantId);

  const [products, activeCategories] = await Promise.all([
    ids.length
      ? Product.find({ 'variants._id': { $in: ids }, status: 'published' }).lean<ProductLean[]>()
      : Promise.resolve([] as ProductLean[]),
    Category.find({ status: 'active' }).select('_id').lean<{ _id: Types.ObjectId }[]>(),
  ]);
  const activeCategoryIds = new Set(activeCategories.map((c) => String(c._id)));

  const byVariant = new Map<string, { product: ProductLean; variant: IVariant }>();
  for (const product of products) {
    if (!activeCategoryIds.has(String(product.categoryId))) continue;
    for (const variant of product.variants) byVariant.set(String(variant._id), { product, variant });
  }

  const lines: PricedLine[] = merged.map(({ variantId, quantity }) => {
    const hit = byVariant.get(variantId);
    if (!hit || !hit.variant.isActive) return unavailable(variantId, quantity);
    const { product, variant } = hit;
    const unitPrice = effectivePrice(variant.price, variant.salePrice);
    const cap = Math.min(
      s.maxQuantityPerLine,
      product.allowBackorder ? s.maxQuantityPerLine : Math.max(variant.stock, 0),
    );
    return {
      variantId,
      productId: String(product._id),
      productSlug: product.slug,
      sku: variant.sku,
      name: product.name,
      options: variant.options,
      image: product.images[0] ?? null,
      unitPrice,
      compareAtPrice: isOnSale(variant.price, variant.salePrice) ? variant.price : null,
      quantity,
      lineTotal: unitPrice * quantity,
      status: quantity <= cap ? 'ok' : 'insufficient_stock',
      availableQuantity: cap,
    };
  });

  const payable = lines.filter((l) => l.status === 'ok');
  const subtotal = payable.reduce((sum, l) => sum + l.lineTotal, 0);

  let discount = 0;
  let couponId: string | null = null;
  let coupon: PricedCart['coupon'] = null;
  if (input.couponCode) {
    const { coupon: found, result } = await evaluateCoupon(input.couponCode, subtotal);
    if (result.ok && found) {
      discount = result.discount;
      couponId = String(found._id);
      coupon = { code: found.code, valid: true, message: null };
    } else if (!result.ok) {
      coupon = {
        code: input.couponCode.toUpperCase(),
        valid: false,
        message: failureMessage(result.reason, found ?? undefined),
      };
    }
  }

  const afterDiscount = subtotal - discount;
  const shippingFee = computeShipping(s, afterDiscount, payable.length > 0);
  const threshold = s.shipping.freeShippingThreshold;

  return {
    couponId,
    cart: {
      currency: 'PKR',
      lines,
      subtotal,
      discount,
      coupon,
      shippingFee,
      total: afterDiscount + shippingFee,
      freeShippingRemaining:
        payable.length > 0 && threshold != null && afterDiscount < threshold ? threshold - afterDiscount : null,
      canCheckout: lines.length > 0 && lines.every((l) => l.status === 'ok') && (coupon === null || coupon.valid),
    },
  };
}
