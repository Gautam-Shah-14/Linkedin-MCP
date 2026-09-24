import type { NextFunction, Request, Response } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

/**
 * Placeholder auth for Phase 1/2: reads a user id from X-User-Id.
 * Replaced in Phase 3 by real JWT/OAuth verification (§8) — nothing here
 * should be trusted once that lands.
 */
export function devUserMiddleware(req: Request, res: Response, next: NextFunction): void {
  const userId = req.header('x-user-id');
  if (!userId) {
    res.status(401).json({ error: 'Missing X-User-Id header (dev-only auth placeholder)' });
    return;
  }
  req.userId = userId;
  next();
}
