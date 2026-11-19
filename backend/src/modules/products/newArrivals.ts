import type { Types } from 'mongoose';
import { Category } from '../categories/category.model';
import { NEW_ARRIVAL_PER_CATEGORY, newArrivalSince } from './product.constants';
import { Product } from './product.model';

/**
 * The products that currently count as new: the newest few of each category (see product.constants.ts). Eligible means
 * what a shopper can see (published, in an active category). Ties on publish date are broken by id so the answer is stable. Pass the active category ids when the caller already has them.
 */
export async function newArrivalIds(activeCategoryIds?: Types.ObjectId[]): Promise<Types.ObjectId[]> {
  const categoryIds =
    activeCategoryIds ??
    (await Category.find({ status: 'active' }).select('_id').lean<{ _id: Types.ObjectId }[]>()).map((c) => c._id);
  const rows = await Product.find({
    status: 'published',
    categoryId: { $in: categoryIds },
    publishedAt: { $gte: newArrivalSince() },
  })
    .sort({ publishedAt: -1, _id: -1 })
    .limit(1000)
    .select('_id categoryId')
    .lean<{ _id: Types.ObjectId; categoryId: Types.ObjectId }[]>();
  const taken = new Map<string, number>();
  const ids: Types.ObjectId[] = [];
  for (const r of rows) {
    const key = String(r.categoryId);
    const n = taken.get(key) ?? 0;
    if (n >= NEW_ARRIVAL_PER_CATEGORY) continue;
    taken.set(key, n + 1);
    ids.push(r._id);
  }
  return ids;
}

export const newArrivalSet = async (): Promise<ReadonlySet<string>> => new Set((await newArrivalIds()).map(String));
