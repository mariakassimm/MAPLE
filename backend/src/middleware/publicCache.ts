import type { RequestHandler } from 'express';

// Short shared-cache window for anonymous catalogue reads. Kept short because prices can change;
// the server re-prices everything at checkout regardless of what a cached page showed.
export const publicCache =
  (seconds: number): RequestHandler =>
  (_req, res, next) => {
    res.setHeader('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 5}`);
    next();
  };
