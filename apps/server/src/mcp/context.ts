import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';

export type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/** Pulls our own user id out of the verified auth info (see oauthProvider.verifyAccessToken). */
export function requireUserId(extra: ToolExtra): string {
  const userId = extra.authInfo?.extra?.userId;
  if (typeof userId !== 'string') {
    throw new Error('Missing authenticated user on MCP request');
  }
  return userId;
}
