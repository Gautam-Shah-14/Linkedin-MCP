import { z } from 'zod';

export const postStatusSchema = z.enum([
  'draft',
  'pending_approval',
  'approved',
  'scheduled',
  'published',
  'failed',
]);

export type PostStatus = z.infer<typeof postStatusSchema>;

export const postSourceSchema = z.enum(['app', 'mcp_app', 'mcp_claude']);

export type PostSource = z.infer<typeof postSourceSchema>;
