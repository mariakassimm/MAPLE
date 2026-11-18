import { z } from 'zod';
import { imageInputSchema } from '../../common/image';
import { slugSchema } from '../../common/validators';

// Internal links must be paths on this site ("/shop"), never full URLs: no open redirects, no javascript: links.
const path = z
  .string()
  .trim()
  .max(200)
  .regex(/^\/(?!\/)[^\s]*$/, 'Use a link inside the site, starting with a single "/"');
const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .url()
  .refine((u) => u.startsWith('https://'), 'Use an https link');
const image = imageInputSchema.nullable();
const text = (max: number) => z.string().trim().max(max);

export const siteSchema = z
  .object({
    announcement: z.object({ text: text(120), isActive: z.boolean() }).strict(),
    contact: z
      .object({
        email: z.string().trim().email().max(254).or(z.literal('')),
        phone: text(30),
        whatsapp: text(30),
        address: text(300),
      })
      .partial()
      .strict(),
    social: z
      .object({
        instagram: httpsUrl.or(z.literal('')),
        facebook: httpsUrl.or(z.literal('')),
        tiktok: httpsUrl.or(z.literal('')),
        youtube: httpsUrl.or(z.literal('')),
        pinterest: httpsUrl.or(z.literal('')),
      })
      .partial()
      .strict(),
    footerStatement: text(200),
  })
  .strict();

export const homeSchema = z
  .object({
    hero: z
      .object({
        label: text(60),
        headline: text(120),
        subheadline: text(300),
        ctaLabel: text(40),
        ctaUrl: path,
        image,
        imageMobile: image,
        videoUrl: httpsUrl.nullable(),
        videoPoster: image,
      })
      .strict(),
    collections: z
      .array(
        z
          .object({
            title: text(80).optional(),
            description: text(200).optional(),
            url: path.optional(),
            image: image.optional(),
            categorySlug: slugSchema.optional(),
          })
          .strict()
          .refine((c) => !!c.categorySlug || (!!c.title && !!c.url), 'Give a category, or a title and a link'),
      )
      .max(6),
    brandStory: z.object({ headline: text(120), body: text(1500), image }).strict(),
    editorial: z.object({ headline: text(120), body: text(1500), linkLabel: text(40), linkUrl: path, image }).strict(),
    newsletter: z.object({ headline: text(120), subheadline: text(200) }).strict(),
    testimonialsEnabled: z.boolean(),
  })
  .strict();

export const sitePatchSchema = siteSchema
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one section');
export const homePatchSchema = homeSchema
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one section');

export const pageCreateSchema = z
  .object({
    slug: slugSchema,
    title: z.string().trim().min(2).max(120),
    body: z.string().max(30_000).optional(),
    published: z.boolean().optional(),
    seoTitle: text(70).optional(),
    seoDescription: text(160).optional(),
  })
  .strict();
export const pageUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    body: z.string().max(30_000),
    published: z.boolean(),
    seoTitle: text(70),
    seoDescription: text(160),
    slug: slugSchema,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field');
