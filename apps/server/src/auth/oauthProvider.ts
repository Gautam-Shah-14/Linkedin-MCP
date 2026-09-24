import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';
import type { Response } from 'express';

import type { Database } from '../db/client.js';
import { oauthClients, oauthCodes, oauthRefreshTokens } from '../db/schema.js';
import { signAccessToken, verifyAccessToken } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';

import type {
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

const AUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Pending authorization requests, keyed by an opaque id we hand to our own
 * login page. Kept in memory: short-lived (minutes), single-process is fine
 * for now, and losing one on restart just means the user retries login.
 */
const pendingAuthorizations = new Map<
  string,
  { client: OAuthClientInformationFull; params: AuthorizationParams }
>();

export function getPendingAuthorization(requestId: string) {
  return pendingAuthorizations.get(requestId);
}

export function consumePendingAuthorization(requestId: string) {
  const entry = pendingAuthorizations.get(requestId);
  pendingAuthorizations.delete(requestId);
  return entry;
}

function clientsStore(db: Database): OAuthRegisteredClientsStore {
  return {
    async getClient(clientId) {
      const [row] = await db
        .select()
        .from(oauthClients)
        .where(eq(oauthClients.clientId, clientId))
        .limit(1);
      return row?.data as OAuthClientInformationFull | undefined;
    },

    async registerClient(client: OAuthClientMetadata) {
      const clientId = randomUUID();
      const needsSecret = client.token_endpoint_auth_method !== 'none';
      const clientSecret = needsSecret ? randomBytes(32).toString('hex') : undefined;

      const full: OAuthClientInformationFull = {
        ...client,
        client_id: clientId,
        client_secret: clientSecret,
        client_id_issued_at: Math.floor(Date.now() / 1000),
      };

      await db.insert(oauthClients).values({
        clientId,
        clientSecretHash: clientSecret ? sha256(clientSecret) : null,
        redirectUris: client.redirect_uris,
        name: client.client_name ?? 'Unnamed MCP client',
        data: full,
      });

      logger.info({ clientId, name: full.client_name }, 'registered oauth client');
      return full;
    },
  };
}

/**
 * DB-backed OAuth 2.1 provider for MCP clients (claude.ai and our own app),
 * per §8. Access tokens are short-lived JWTs (stateless, self-verifying);
 * only authorization codes and refresh tokens are persisted.
 */
export function createOAuthProvider(db: Database): OAuthServerProvider {
  return {
    clientsStore: clientsStore(db),

    async authorize(client, params, res: Response) {
      const requestId = randomUUID();
      pendingAuthorizations.set(requestId, { client, params });
      // Expire the pending entry so it can't be replayed indefinitely.
      setTimeout(() => pendingAuthorizations.delete(requestId), AUTH_CODE_TTL_MS).unref();
      res.redirect(`/oauth/login?request_id=${requestId}`);
    },

    async challengeForAuthorizationCode(_client, authorizationCode) {
      const [row] = await db
        .select()
        .from(oauthCodes)
        .where(eq(oauthCodes.codeHash, sha256(authorizationCode)))
        .limit(1);
      if (!row) {
        throw new Error('Invalid authorization code');
      }
      return row.codeChallenge;
    },

    async exchangeAuthorizationCode(
      client,
      authorizationCode,
      _codeVerifier,
      redirectUri,
    ): Promise<OAuthTokens> {
      const codeHash = sha256(authorizationCode);
      const [row] = await db.select().from(oauthCodes).where(eq(oauthCodes.codeHash, codeHash)).limit(1);
      if (!row) {
        throw new Error('Invalid authorization code');
      }
      if (row.expiresAt.getTime() < Date.now()) {
        throw new Error('Authorization code expired');
      }
      if (row.clientId !== client.client_id) {
        throw new Error('Authorization code was issued to a different client');
      }
      if (redirectUri && row.redirectUri !== redirectUri) {
        throw new Error('redirect_uri does not match the original request');
      }

      // Single use.
      await db.delete(oauthCodes).where(eq(oauthCodes.id, row.id));

      const { token, expiresIn } = signAccessToken({
        sub: row.userId,
        client_id: client.client_id,
        scope: row.scope,
      });

      const refreshToken = randomBytes(32).toString('hex');
      await db.insert(oauthRefreshTokens).values({
        tokenHash: sha256(refreshToken),
        clientId: client.client_id,
        userId: row.userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      });

      return {
        access_token: token,
        token_type: 'Bearer',
        expires_in: expiresIn,
        scope: row.scope,
        refresh_token: refreshToken,
      };
    },

    async exchangeRefreshToken(client, refreshToken, scopes): Promise<OAuthTokens> {
      const tokenHash = sha256(refreshToken);
      const [row] = await db
        .select()
        .from(oauthRefreshTokens)
        .where(
          and(
            eq(oauthRefreshTokens.tokenHash, tokenHash),
            eq(oauthRefreshTokens.clientId, client.client_id),
            isNull(oauthRefreshTokens.revokedAt),
          ),
        )
        .limit(1);
      if (!row) {
        throw new Error('Invalid refresh token');
      }
      if (row.expiresAt.getTime() < Date.now()) {
        throw new Error('Refresh token expired');
      }

      const scope = scopes?.join(' ') ?? 'mcp';
      const { token, expiresIn } = signAccessToken({
        sub: row.userId,
        client_id: client.client_id,
        scope,
      });

      // Rotate: revoke the old refresh token, issue a new one.
      const newRefreshToken = randomBytes(32).toString('hex');
      await db
        .update(oauthRefreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(oauthRefreshTokens.id, row.id));
      await db.insert(oauthRefreshTokens).values({
        tokenHash: sha256(newRefreshToken),
        clientId: client.client_id,
        userId: row.userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      });

      return {
        access_token: token,
        token_type: 'Bearer',
        expires_in: expiresIn,
        scope,
        refresh_token: newRefreshToken,
      };
    },

    async verifyAccessToken(token): Promise<AuthInfo> {
      const claims = verifyAccessToken(token);
      return {
        token,
        clientId: claims.client_id,
        scopes: claims.scope.split(' ').filter(Boolean),
        expiresAt: claims.exp,
        extra: { userId: claims.sub },
      };
    },

    async revokeToken(client, request: OAuthTokenRevocationRequest) {
      if (request.token_type_hint === 'access_token') {
        // JWT access tokens are stateless; they simply expire (1h TTL).
        return;
      }
      await db
        .update(oauthRefreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(oauthRefreshTokens.tokenHash, sha256(request.token)),
            eq(oauthRefreshTokens.clientId, client.client_id),
          ),
        );
    },
  };
}

export async function issueAuthorizationCode(
  db: Database,
  input: {
    clientId: string;
    userId: string;
    codeChallenge: string;
    redirectUri: string;
    scope: string;
  },
): Promise<string> {
  const code = randomBytes(32).toString('hex');
  await db.insert(oauthCodes).values({
    codeHash: sha256(code),
    clientId: input.clientId,
    userId: input.userId,
    codeChallenge: input.codeChallenge,
    redirectUri: input.redirectUri,
    scope: input.scope,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
  });
  return code;
}
