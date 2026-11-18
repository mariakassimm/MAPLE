import { z } from 'zod';
import { imageInputSchema } from '../../common/image';
import { slugSchema } from '../../common/validators';

const fields = {
  name: z.string().trim().min(2).max(80),
  slug: slugSchema,
  description: z.string().trim().max(600),
  image: imageInputSchema.nullable(),
  displayOrder: z.number().int().min(0).max(10_000),
  status: z.enum(['active', 'archived']),
};

export const categoryCreateSchema = z
  .object({
    name: fields.name,
    slug: fields.slug.optional(),
    description: fields.description.optional(),
    image: imageInputSchema.optional(),
    displayOrder: fields.displayOrder.optional(),
  })
  .strict();

export const categoryUpdateSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field');
