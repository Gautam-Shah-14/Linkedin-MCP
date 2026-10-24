import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { db } from '../../db/client.js';
import { recordAuditEvent } from '../../services/auditService.js';
import {
  createDraft,
  getPost,
  INSTAGRAM_CAPTION_MAX,
  listAccountsForUser,
  listPosts,
  publishPost,
  updateDraft,
  userOwnsAccount,
} from '../../services/instagramService.js';
import { requireUserId, type ToolExtra } from '../context.js';

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

async function requireOwnedPost(userId: string, postId: string) {
  const post = await getPost(db, postId);
  if (!post) {
    throw new Error('Post not found');
  }
  if (!(await userOwnsAccount(db, userId, post.accountId))) {
    throw new Error('You do not own this Instagram account');
  }
  return post;
}

// Write tools set destructiveHint: true (repo rule in CLAUDE.md).
export function registerInstagramTools(server: McpServer): void {
  server.registerTool(
    'instagram_list_accounts',
    {
      title: 'List Instagram accounts',
      description: 'Lists the Instagram professional accounts the current user has connected.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (_args, extra: ToolExtra) => {
      const accounts = await listAccountsForUser(db, requireUserId(extra));
      return text({ accounts });
    },
  );

  server.registerTool(
    'instagram_create_draft',
    {
      title: 'Create an Instagram draft',
      description:
        'Creates a draft Instagram post (one JPEG image plus a caption). This never publishes — a human must approve it in the app first. imageUrl must be a public https URL to a JPEG.',
      inputSchema: {
        accountId: z.string().uuid().describe('The account id from instagram_list_accounts'),
        caption: z.string().min(1).max(INSTAGRAM_CAPTION_MAX),
        imageUrl: z.string().url().describe('Public https URL of a JPEG image'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args, extra: ToolExtra) => {
      const userId = requireUserId(extra);
      if (!(await userOwnsAccount(db, userId, args.accountId))) {
        throw new Error('You do not own this Instagram account');
      }
      const draft = await createDraft(db, { ...args, createdBy: userId, source: 'mcp_claude' });
      return text(`Instagram draft created (id: ${draft?.id}, status: draft). Caption preview:\n\n${draft?.caption}`);
    },
  );

  server.registerTool(
    'instagram_update_draft',
    {
      title: 'Update an Instagram draft',
      description: 'Edits the caption or image of a draft. Editing an approved post sends it back to draft so it must be approved again.',
      inputSchema: {
        postId: z.string().uuid(),
        caption: z.string().min(1).max(INSTAGRAM_CAPTION_MAX).optional(),
        imageUrl: z.string().url().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args, extra: ToolExtra) => {
      await requireOwnedPost(requireUserId(extra), args.postId);
      const row = await updateDraft(db, args.postId, { caption: args.caption, imageUrl: args.imageUrl });
      return text(`Draft updated (id: ${row?.id}, status: ${row?.status}).`);
    },
  );

  server.registerTool(
    'instagram_list_posts',
    {
      title: 'List Instagram posts',
      description: 'Lists Instagram posts (drafts, approved, published, failed) for the current user.',
      inputSchema: {
        status: z.enum(['draft', 'approved', 'publishing', 'published', 'failed']).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args, extra: ToolExtra) => {
      const accounts = await listAccountsForUser(db, requireUserId(extra));
      const rows = await listPosts(db, { accountIds: accounts.map((a) => a.id), status: args.status });
      return text({
        posts: rows.map((row) => ({
          id: row.id,
          accountId: row.accountId,
          status: row.status,
          preview: row.caption.slice(0, 80),
          imageUrl: row.imageUrl,
          publishedAt: row.publishedAt,
        })),
      });
    },
  );

  server.registerTool(
    'instagram_publish_post',
    {
      title: 'Publish an Instagram post',
      description:
        'Publishes an APPROVED Instagram post immediately. This is irreversible. confirmText must exactly equal the first 30 characters of the caption — fetch the post with instagram_list_posts first and echo it back. The post must already have been approved by a human in the app.',
      inputSchema: {
        postId: z.string().uuid(),
        confirmText: z.string().min(1).max(30).describe('First 30 characters of the caption, verbatim'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async (args, extra: ToolExtra) => {
      const userId = requireUserId(extra);
      await requireOwnedPost(userId, args.postId);
      const published = await publishPost(db, { postId: args.postId, confirmText: args.confirmText });
      await recordAuditEvent(db, {
        userId,
        action: 'instagram_publish_post',
        target: args.postId,
        source: 'mcp_claude',
        meta: { igMediaId: published?.igMediaId },
      });
      return text(`Published to Instagram: ${published?.igMediaId}`);
    },
  );
}
