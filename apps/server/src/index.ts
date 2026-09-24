import express from 'express';

import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { healthRouter } from './routes/health.js';

const app = express();

app.use(express.json());
app.use(healthRouter);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'server listening');
});
