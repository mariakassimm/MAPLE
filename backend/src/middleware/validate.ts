import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../common/errors';

type Part = 'params' | 'query' | 'body';

// Schemas should be .strict() so unexpected fields are rejected rather than silently stored.
export const validate =
  (schemas: Partial<Record<Part, ZodTypeAny>>): RequestHandler =>
  (req, _res, next) => {
    const details: { field: string; message: string }[] = [];
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) {
        (req as unknown as Record<Part, unknown>)[part] = result.data;
      } else {
        details.push(...result.error.issues.map((i) => ({ field: [part, ...i.path].join('.'), message: i.message })));
      }
    }
    if (details.length > 0) return next(new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', details));
    next();
  };
