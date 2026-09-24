import { getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { Router } from 'express';

import { createOAuthProvider } from '../auth/oauthProvider.js';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { handleMcpRequest } from '../mcp/transport.js';

export const mcpRouter = Router();

const baseUrl = new URL(env.PUBLIC_BASE_URL);
const mcpUrl = new URL('/mcp', baseUrl);
const provider = createOAuthProvider(db);

mcpRouter.use(
  mcpAuthRouter({
    provider,
    issuerUrl: baseUrl,
    resourceServerUrl: mcpUrl,
    scopesSupported: ['mcp'],
    resourceName: 'TokenBurners LinkedIn MCP',
  }),
);

mcpRouter.all(
  '/mcp',
  requireBearerAuth({
    verifier: provider,
    requiredScopes: [],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
  }),
  handleMcpRequest,
);
