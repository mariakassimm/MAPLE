import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/asyncHandler';
import { AppError } from '../../common/errors';
import { sendOk } from '../../common/response';
import { env } from '../../config/env';
import { requireAnyPermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { signCloudinaryParams } from './cloudinary';

// The browser uploads straight to Cloudinary, so image bytes never pass through (or can exhaust) this API.
// Each signature is short-lived, limited to one folder and to image formats, and the secret never leaves the server.
const FOLDERS = { products: 'maple/products', categories: 'maple/categories', content: 'maple/content' } as const;
const ALLOWED_FORMATS = 'jpg,jpeg,png,webp,avif';
// Video is only for the homepage hero (content folder).
const ALLOWED_VIDEO_FORMATS = 'mp4,webm,mov';

export const mediaAdminRouter = Router();

mediaAdminRouter.post(
  '/signature',
  requireAnyPermission('products:write', 'categories:write', 'content:write'),
  validate({
    body: z
      .object({ folder: z.enum(['products', 'categories', 'content']), kind: z.enum(['image', 'video']).optional() })
      .strict(),
  }),
  asyncHandler(async (req, res) => {
    const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: secret } = env;
    if (!cloudName || !apiKey || !secret)
      throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Image uploads are not configured yet.');
    const video = req.body.kind === 'video';
    if (video && req.body.folder !== 'content')
      throw new AppError(400, 'BAD_REQUEST', 'Video uploads are only for homepage content.');
    const params = {
      allowed_formats: video ? ALLOWED_VIDEO_FORMATS : ALLOWED_FORMATS,
      folder: FOLDERS[req.body.folder as keyof typeof FOLDERS],
      timestamp: Math.floor(Date.now() / 1000),
    };
    sendOk(res, {
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${video ? 'video' : 'image'}/upload`,
      cloudName,
      apiKey,
      // The upload form must send exactly these fields plus the file; changing any of them invalidates the signature.
      params,
      signature: signCloudinaryParams(params, secret),
    });
  }),
);
