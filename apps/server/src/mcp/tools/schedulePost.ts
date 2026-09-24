import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { db } from '../../db/client.js';
import { recordAuditEvent } from '../../services/auditService.js';
import { userCanPublishAsAuthor } from '../../services/authorService.js';
import { getPost, schedulePost } from '../../services/postService.js';
import { requireUserId, type ToolExtra } from '../context.js';

export function registerSchedulePostTool(server: McpServer): void {
  server.registerTool(
    'schedule_post',
    {
      title: 'Schedule a LinkedIn post',
      description:
        'Schedules a draft to be published to LinkedIn automatically at a future time.',
      inputSchema: {
        draftId: z.string().uuid(),
        scheduledAt: z.string().datetime().describe('ISO 8601 timestamp, in the future'),
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
        throw new Error('You are not authorized to schedule as this author');
      }

      const scheduledAt = new Date(args.scheduledAt);
      if (scheduledAt.getTime() <= Date.now()) {
        throw new Error('scheduledAt must be in the future');
      }

      const scheduled = await schedulePost(db, args.draftId, scheduledAt);

      await recordAuditEvent(db, {
        userId,
        action: 'schedule_post',
        target: args.draftId,
        source: 'mcp_claude',
        meta: { scheduledAt: args.scheduledAt },
      });

      return {
        content: [
          { type: 'text', text: `Scheduled draft ${scheduled?.id} for ${args.scheduledAt}.` },
        ],
      };
    },
  );
}
