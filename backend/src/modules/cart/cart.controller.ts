import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/response';
import { Cart } from './cart.model';
import { mergeLines, priceCart, type CartInputLine } from './pricing.service';

const loadItems = async (userId: string): Promise<CartInputLine[]> => {
  const cart = await Cart.findOne({ userId }).lean();
  return (cart?.items ?? []).map((i) => ({ variantId: String(i.variantId), quantity: i.quantity }));
};

export const price = asyncHandler(async (req, res) => {
  const { cart } = await priceCart(req.body);
  sendOk(res, { cart });
});

export const get = asyncHandler(async (req, res) => {
  const { cart } = await priceCart({
    items: await loadItems(req.auth!.userId),
    couponCode: req.query.couponCode as string | undefined,
  });
  sendOk(res, { cart });
});

// Replace-all semantics: the client always sends the full list, which keeps add/update/remove a single operation
// and merges duplicate variants so the same item can never appear on two lines.
export const save = asyncHandler(async (req, res) => {
  const items = mergeLines(req.body.items).map((l) => ({ ...l, quantity: Math.min(l.quantity, 99) }));
  await Cart.updateOne({ userId: req.auth!.userId }, { $set: { items } }, { upsert: true });
  const { cart } = await priceCart({ items, couponCode: req.body.couponCode });
  sendOk(res, { cart });
});

export const clear = asyncHandler(async (req, res) => {
  await Cart.updateOne({ userId: req.auth!.userId }, { $set: { items: [] } });
  sendOk(res, { cleared: true });
});
