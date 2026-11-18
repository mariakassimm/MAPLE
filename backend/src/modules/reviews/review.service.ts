import { Types } from 'mongoose';
import { AppError, duplicateKeyFields, isDuplicateKeyError } from '../../common/errors';
import { pageMeta } from '../../common/pagination';
import { Order } from '../orders/order.model';
import { Product, type ProductLean } from '../products/product.model';
import { User } from '../users/user.model';
import { Review, type ReviewLean, type ReviewStatus } from './review.model';

export const displayNameOf = (fullName: string): string => {
  const [first = '', ...rest] = fullName.trim().split(/\s+/);
  const last = rest[rest.length - 1];
  return last ? `${first} ${last[0]!.toUpperCase()}.` : first;
};

export async function ratingSummary(productId: Types.ObjectId | string) {
  const rows = await Review.aggregate<{ _id: number; n: number }>([
    { $match: { productId: new Types.ObjectId(String(productId)), status: 'approved' } },
    { $group: { _id: '$rating', n: { $sum: 1 } } },
  ]);
  const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let count = 0;
  let sum = 0;
  for (const r of rows) {
    distribution[String(r._id)] = r.n;
    count += r.n;
    sum += r._id * r.n;
  }
  return { count, average: count ? Math.round((sum / count) * 10) / 10 : 0, distribution };
}

async function recomputeRating(productId: Types.ObjectId | string): Promise<void> {
  const { count, average } = await ratingSummary(productId);
  await Product.updateOne({ _id: productId }, { $set: { ratingAverage: average, ratingCount: count } });
}

export async function createReview(
  userId: string,
  input: { productSlug: string; rating: number; title?: string; body: string },
) {
  const product = await Product.findOne({ slug: input.productSlug, status: 'published' }).lean<ProductLean>();
  if (!product) throw new AppError(404, 'NOT_FOUND', 'Product not found.');
  // Verified purchases only: the shopper must hold a delivered order that contains this product.
  const order = await Order.findOne({ userId, status: 'delivered', 'items.productId': product._id })
    .sort({ createdAt: -1 })
    .select('_id')
    .lean();
  if (!order) throw new AppError(403, 'FORBIDDEN', 'Only customers who have received this product can review it.');
  const user = await User.findById(userId).select('name');
  try {
    return await Review.create({
      productId: product._id,
      userId,
      orderId: order._id,
      rating: input.rating,
      title: input.title,
      body: input.body,
      displayName: displayNameOf(user?.name ?? 'Customer'),
      status: 'pending',
    });
  } catch (err) {
    if (isDuplicateKeyError(err) && duplicateKeyFields(err).includes('userId'))
      throw new AppError(409, 'CONFLICT', 'You have already reviewed this product.');
    throw err;
  }
}

export async function listPublicReviews(slug: string, page: number, limit: number) {
  const product = await Product.findOne({ slug, status: 'published' }).select('_id').lean();
  if (!product) throw new AppError(404, 'NOT_FOUND', 'Product not found.');
  const filter = { productId: product._id, status: 'approved' };
  const [items, total, summary] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<ReviewLean[]>(),
    Review.countDocuments(filter),
    ratingSummary(product._id),
  ]);
  return {
    summary,
    items: items.map((r) => ({
      id: String(r._id),
      rating: r.rating,
      title: r.title ?? null,
      body: r.body,
      displayName: r.displayName,
      verifiedPurchase: true,
      createdAt: r.createdAt,
    })),
    pagination: pageMeta(page, limit, total),
  };
}

export async function moderateReview(
  id: string,
  patch: { status?: ReviewStatus; featured?: boolean },
  actorId: string,
) {
  const review = await Review.findById(id);
  if (!review) throw new AppError(404, 'NOT_FOUND', 'Review not found.');
  const next = { ...patch };
  // A review that is not approved can never be a homepage testimonial.
  if (next.featured && (next.status ?? review.status) !== 'approved')
    throw new AppError(400, 'BAD_REQUEST', 'Only approved reviews can be featured.');
  if (next.status && next.status !== 'approved') next.featured = false;
  review.set({ ...next, moderatedBy: actorId });
  await review.save();
  await recomputeRating(review.productId);
  return review;
}

export async function listAdminReviews(q: { page: number; limit: number; status?: ReviewStatus }) {
  const filter = q.status ? { status: q.status } : {};
  const [items, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean<ReviewLean[]>(),
    Review.countDocuments(filter),
  ]);
  const products = await Product.find({ _id: { $in: items.map((i) => i.productId) } })
    .select('name slug')
    .lean<{ _id: Types.ObjectId; name: string; slug: string }[]>();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return {
    items: items.map((r) => ({
      id: String(r._id),
      productName: byId.get(String(r.productId))?.name ?? null,
      productSlug: byId.get(String(r.productId))?.slug ?? null,
      rating: r.rating,
      title: r.title ?? null,
      body: r.body,
      displayName: r.displayName,
      status: r.status,
      featured: r.featured,
      createdAt: r.createdAt,
    })),
    pagination: pageMeta(q.page, q.limit, total),
  };
}
