import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerAttachImageTool } from './tools/attachImage.js';
import { registerCreateDraftTool } from './tools/createDraft.js';
import { registerListAuthorsTool } from './tools/listAuthors.js';
import { registerListPostsTool } from './tools/listPosts.js';
import { registerPublishPostTool } from './tools/publishPost.js';
import { registerSchedulePostTool } from './tools/schedulePost.js';
import { registerUpdateDraftTool } from './tools/updateDraft.js';

/** Builds a fresh McpServer per request — see transport.ts for why. */
export function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: 'tb-linkedin',
    version: '0.0.1',
  });

  registerListAuthorsTool(server);
  registerCreateDraftTool(server);
  registerUpdateDraftTool(server);
  registerListPostsTool(server);
  registerAttachImageTool(server);
  registerPublishPostTool(server);
  registerSchedulePostTool(server);

  return server;
}
