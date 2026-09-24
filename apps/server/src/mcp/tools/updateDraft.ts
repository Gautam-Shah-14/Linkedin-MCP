import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { db } from '../../db/client.js';
import { getPost, updateDraft } from '../../services/postService.js';
import { requireUserId, type ToolExtra } from '../context.js';

export function registerUpdateDraftTool(server: McpServer): void {
  server.registerTool(
    'update_draft',
    {
      title: 'Update a LinkedIn draft',
      description: 'Edits the text of an existing draft post. Only drafts (not published/scheduled posts) can be edited.',
      inputSchema: {
        draftId: z.string().uuid(),
        text: z.string().min(1).max(3000),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args, extra: ToolExtra) => {
      const userId = requireUserId(extra);
      const existing = await getPost(db, args.draftId);
      if (!existing || existing.createdBy !== userId) {
        throw new Error('Draft not found');
      }
      const draft = await updateDraft(db, { draftId: args.draftId, text: args.text });
      return {
        content: [
          { type: 'text', text: `Draft updated (id: ${draft?.id}). Preview:\n\n${draft?.text}` },
        ],
      };
    },
  );
}
