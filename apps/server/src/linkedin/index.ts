import { env } from '../config/env.js';
import type { LinkedInClient } from './client.js';
import { mockLinkedInClient } from './mock.js';
import { realLinkedInClient } from './real.js';

export const linkedInClient: LinkedInClient = env.LINKEDIN_MOCK
  ? mockLinkedInClient
  : realLinkedInClient;

export * from './client.js';
export { escapeLittleText } from './littleText.js';
export { LinkedInApiError } from './http.js';
