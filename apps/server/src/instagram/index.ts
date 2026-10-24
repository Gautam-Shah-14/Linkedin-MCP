import { env } from '../config/env.js';
import type { InstagramClient } from './client.js';
import { mockInstagramClient } from './mock.js';
import { realInstagramClient } from './real.js';

export const instagramClient: InstagramClient = env.INSTAGRAM_MOCK
  ? mockInstagramClient
  : realInstagramClient;

export * from './client.js';
export { InstagramApiError } from './http.js';
