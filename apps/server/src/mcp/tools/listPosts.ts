import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { db } from '../../db/client.js';
import { listAuthorsForUser } from '../../services/authorService.js';
import { listPosts } from '../../services/postService.js';
import { requireUserId, type ToolExtra } from '../context.js';

export function registerListPostsTool(server: McpServer): void {
  server.registerTool(
    'list_posts',
    {
      title: 'List LinkedIn posts',
      description:
        'Lists posts (drafts, scheduled, and published) for authors the current user is a member of. Returns small summaries, not full LinkedIn payloads.',
      inputSchema: {
        authorId: z.string().uuid().optional(),
        status: z
          .enum(['draft', 'pending_approval', 'approved', 'scheduled', 'published', 'failed'])
          .optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args, extra: ToolExtra) => {
      const userId = requireUserId(extra);
      const myAuthors = await listAuthorsForUser(db, userId);
      const myAuthorIds = new Set(myAuthors.map((a) => a.id));

      if (args.authorId && !myAuthorIds.has(args.authorId)) {
        throw new Error('You are not a member of this author');
      }

      const rows = await listPosts(db, { authorId: args.authorId, status: args.status });
      const visible = rows.filter((row) => myAuthorIds.has(row.authorId));

      const summaries = visible.map((row) => ({
        id: row.id,
        authorId: row.authorId,
        status: row.status,
        preview: row.text.slice(0, 80),
        scheduledAt: row.scheduledAt,
        publishedAt: row.publishedAt,
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify({ posts: summaries }, null, 2) }],
      };
    },
  );
}
