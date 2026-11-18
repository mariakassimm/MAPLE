import type { Types } from 'mongoose';
import { Category } from '../categories/category.model';
import { NEW_ARRIVAL_LIMIT, newArrivalSince } from './product.constants';
import { Product } from './product.model';

/**
 * The products that currently count as new. Eligible means what a shopper can see (published, in an active category).
 * Ties on publish date are broken by id so the answer is stable. Pass the active category ids when the caller already has them.
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
    .limit(NEW_ARRIVAL_LIMIT)
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>();
  return rows.map((r) => r._id);
}

export const newArrivalSet = async (): Promise<ReadonlySet<string>> => new Set((await newArrivalIds()).map(String));
