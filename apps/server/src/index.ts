import type { NextFunction, Request, Response } from 'express';
import express from 'express';

import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { authRouter } from './routes/auth.js';
import { authorsRouter } from './routes/authors.js';
import { healthRouter } from './routes/health.js';
import { linkedinRouter } from './routes/linkedin.js';
import { mcpRouter } from './routes/mcp.js';
import { oauthLoginRouter } from './routes/oauthLogin.js';
import { postsRouter } from './routes/posts.js';

const app = express();

app.use(healthRouter);
// MCP router owns body parsing on /mcp itself (SDK reads the raw stream);
// mount it before the global JSON parser so it isn't double-consumed.
app.use(mcpRouter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(oauthLoginRouter);
app.use(authRouter);
app.use(linkedinRouter);
app.use(authorsRouter);
app.use(postsRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  logger.error({ err }, 'request failed');
  res.status(400).json({ error: message });
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'server listening');
});
