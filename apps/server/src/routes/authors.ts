import { Router } from 'express';

import { db } from '../db/client.js';
import { listAuthorsForUser } from '../services/authorService.js';
import { devUserMiddleware } from '../auth/devUser.js';

export const authorsRouter = Router();

authorsRouter.get('/api/authors', devUserMiddleware, async (req, res, next) => {
  try {
    const authorsList = await listAuthorsForUser(db, req.userId!);
    res.json({ authors: authorsList });
  } catch (err) {
    next(err);
  }
});
