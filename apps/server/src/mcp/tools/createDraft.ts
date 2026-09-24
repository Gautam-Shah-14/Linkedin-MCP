import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { db } from '../../db/client.js';
import { userIsAuthorMember } from '../../services/authorService.js';
import { createDraft } from '../../services/postService.js';
import { requireUserId, type ToolExtra } from '../context.js';

export function registerCreateDraftTool(server: McpServer): void {
  server.registerTool(
    'create_draft',
    {
      title: 'Create a LinkedIn draft',
      description:
        'Creates a draft LinkedIn post for the given author. This never publishes to LinkedIn — a human must approve and publish separately.',
      inputSchema: {
        authorId: z.string().uuid().describe('The author id from list_authors'),
        text: z.string().min(1).max(3000).describe('The post text'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args, extra: ToolExtra) => {
      const userId = requireUserId(extra);
      const isMember = await userIsAuthorMember(db, userId, args.authorId);
      if (!isMember) {
        throw new Error('You are not a member of this author');
      }
      const draft = await createDraft(db, {
        authorId: args.authorId,
        createdBy: userId,
        text: args.text,
        source: 'mcp_claude',
      });
      return {
        content: [
          {
            type: 'text',
            text: `Draft created (id: ${draft?.id}, status: draft). Preview:\n\n${draft?.text}`,
          },
        ],
      };
    },
  );
}
