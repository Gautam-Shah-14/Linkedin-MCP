import pino from 'pino';

import { env } from '../config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: ['*.access_token', '*.refresh_token', '*.token', 'req.headers.authorization'],
});
