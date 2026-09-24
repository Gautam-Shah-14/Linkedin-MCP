import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { db } from '../../db/client.js';
import { listAuthorsForUser } from '../../services/authorService.js';
import { requireUserId, type ToolExtra } from '../context.js';

export function registerListAuthorsTool(server: McpServer): void {
  server.registerTool(
    'list_authors',
    {
      title: 'List LinkedIn authors',
      description:
        'Lists the LinkedIn authors (personal profiles or company pages) the current user may post as.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (_args, extra: ToolExtra) => {
      const userId = requireUserId(extra);
      const authors = await listAuthorsForUser(db, userId);
      return {
        content: [{ type: 'text', text: JSON.stringify({ authors }, null, 2) }],
      };
    },
  );
}
