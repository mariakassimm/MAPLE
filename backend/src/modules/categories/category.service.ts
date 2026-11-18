import { AppError, duplicateKeyFields, isDuplicateKeyError } from '../../common/errors';
import { slugify } from '../../common/text';
import { Product } from '../products/product.model';
import { Category, toCategoryDto, type CategoryLean } from './category.model';

const slugTaken = () => new AppError(409, 'CONFLICT', 'This slug is already in use.');

async function uniqueSlug(base: string): Promise<string> {
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await Category.exists({ slug: candidate }))) return candidate;
  }
  throw slugTaken();
}

export async function createCategory(input: {
  name: string;
  slug?: string;
  description?: string;
  image?: { url: string; alt: string; publicId?: string };
  displayOrder?: number;
}) {
  const slug = input.slug ?? (await uniqueSlug(slugify(input.name)));
  try {
    return await Category.create({ ...input, slug });
  } catch (err) {
    if (isDuplicateKeyError(err) && duplicateKeyFields(err).includes('slug')) throw slugTaken();
    throw err;
  }
}

export async function updateCategory(id: string, patch: Record<string, unknown>) {
  const category = await Category.findById(id);
  if (!category) throw new AppError(404, 'NOT_FOUND', 'Category not found.');
  // null clears the image; $set with undefined is skipped by mongoose.
  category.set({ ...patch, image: patch.image === null ? undefined : patch.image });
  try {
    await category.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw slugTaken();
    throw err;
  }
  return category;
}

export async function listCategoriesAdmin() {
  const [categories, counts] = await Promise.all([
    Category.find().sort({ displayOrder: 1, name: 1 }).lean<CategoryLean[]>(),
    Product.aggregate<{ _id: unknown; count: number }>([
      { $match: { status: { $ne: 'archived' } } },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    ]),
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.count]));
  return categories.map((c) => toCategoryDto(c, byId.get(String(c._id)) ?? 0));
}

export async function listCategoriesPublic() {
  const [categories, counts] = await Promise.all([
    Category.find({ status: 'active' }).sort({ displayOrder: 1, name: 1 }).lean<CategoryLean[]>(),
    Product.aggregate<{ _id: unknown; count: number }>([
      { $match: { status: 'published' } },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    ]),
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.count]));
  return categories.map((c) => {
    const { status: _status, ...dto } = toCategoryDto(c, byId.get(String(c._id)) ?? 0);
    return dto;
  });
}
