import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:4000'),
  DATABASE_URL: z.string().optional(),
  JWT_SIGNING_KEY: z.string().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  LINKEDIN_VERSION: z.string().optional(),
  LINKEDIN_SHARE_CLIENT_ID: z.string().optional(),
  LINKEDIN_SHARE_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_COMMUNITY_CLIENT_ID: z.string().optional(),
  LINKEDIN_COMMUNITY_CLIENT_SECRET: z.string().optional(),
  ALLOWED_OAUTH_REDIRECTS: z.string().optional(),
  // z.coerce.boolean() would treat the string 'false' as true.
  LINKEDIN_MOCK: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
