import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { db } from '../../db/client.js';
import { userCanPublishAsAuthor } from '../../services/authorService.js';
import { recordAuditEvent } from '../../services/auditService.js';
import { getPost, publishPost } from '../../services/postService.js';
import { requireUserId, type ToolExtra } from '../context.js';

export function registerPublishPostTool(server: McpServer): void {
  server.registerTool(
    'publish_post',
    {
      title: 'Publish a LinkedIn post',
      description:
        'Publishes a draft to LinkedIn immediately. This is irreversible. confirmText must exactly equal the first 30 characters of the draft text — fetch the draft with list_posts first and echo it back, so the human reviewing this tool call can see exactly what will be published.',
      inputSchema: {
        draftId: z.string().uuid(),
        confirmText: z
          .string()
          .min(1)
          .max(30)
          .describe('The first 30 characters of the draft text, verbatim'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async (args, extra: ToolExtra) => {
      const userId = requireUserId(extra);
      const post = await getPost(db, args.draftId);
      if (!post) {
        throw new Error('Draft not found');
      }
      const canPublish = await userCanPublishAsAuthor(db, userId, post.authorId);
      if (!canPublish) {
        throw new Error('You are not authorized to publish as this author');
      }

      const published = await publishPost(db, {
        draftId: args.draftId,
        confirmText: args.confirmText,
      });

      await recordAuditEvent(db, {
        userId,
        action: 'publish_post',
        target: args.draftId,
        source: 'mcp_claude',
        meta: { linkedinPostUrn: published?.linkedinPostUrn },
      });

      return {
        content: [
          {
            type: 'text',
            text: `Published to LinkedIn: ${published?.linkedinPostUrn}`,
          },
        ],
      };
    },
  );
}
