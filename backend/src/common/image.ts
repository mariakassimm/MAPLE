import { Schema } from 'mongoose';
import { z } from 'zod';

export interface IImage {
  url: string;
  alt: string;
  publicId?: string;
}

export const imageSubSchema = new Schema<IImage>(
  {
    url: { type: String, required: true, maxlength: 500 },
    alt: { type: String, required: true, maxlength: 200 },
    publicId: { type: String, maxlength: 200 },
  },
  { _id: false },
);

// https only: a scheme allowlist keeps javascript: and data: URLs out of every <img src>.
export const imageInputSchema = z
  .object({
    url: z
      .string()
      .trim()
      .max(500)
      .url()
      .refine((u) => u.startsWith('https://'), 'Image URL must use https'),
    alt: z.string().trim().min(2, 'Describe the image for accessibility').max(200),
    publicId: z.string().trim().max(200).optional(),
  })
  .strict();
