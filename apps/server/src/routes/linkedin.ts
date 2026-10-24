import { Router } from 'express';
import { z } from 'zod';

import { loginWithPassword } from '../auth/appAuth.js';
import { devUserMiddleware } from '../auth/devUser.js';
import { renderConnectLoginPage } from '../auth/views/connectLogin.js';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { authorMembers, authors, linkedinAccounts } from '../db/schema.js';
import { encryptToken } from '../lib/crypto.js';
import { signLinkedInState, verifyLinkedInState } from '../lib/jwt.js';
import { linkedInClient } from '../linkedin/index.js';

export const linkedinRouter = Router();

const AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';

function linkedInAuthorizeUrl(userId: string): string {
  const redirectUri = `${env.PUBLIC_BASE_URL}/api/linkedin/callback`;
  const state = signLinkedInState(userId);
  if (env.LINKEDIN_MOCK) {
    // No real LinkedIn app: skip the consent screen and go straight to our callback.
    return `${redirectUri}?${new URLSearchParams({ code: 'mock-code', state }).toString()}`;
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.LINKEDIN_SHARE_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    scope: 'openid profile email w_member_social',
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// Browser flow: sign in, then continue to LinkedIn's consent screen.
linkedinRouter.get('/linkedin/connect', (_req, res) => {
  res.set('Content-Type', 'text/html').send(renderConnectLoginPage({}));
});

const connectLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

linkedinRouter.post('/linkedin/connect', async (req, res) => {
  const parsed = connectLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).set('Content-Type', 'text/html').send(renderConnectLoginPage({ error: 'Invalid form submission.' }));
    return;
  }
  try {
    const { user } = await loginWithPassword(db, parsed.data.email, parsed.data.password);
    res.redirect(linkedInAuthorizeUrl(user.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sign in failed';
    res.status(401).set('Content-Type', 'text/html').send(renderConnectLoginPage({ error: message }));
  }
});

// API flow for non-browser clients (dev-only X-User-Id until real bearer auth lands).
linkedinRouter.get('/api/linkedin/connect', devUserMiddleware, (req, res) => {
  res.redirect(linkedInAuthorizeUrl(req.userId!));
});

const callbackSchema = z.object({
  code: z.string(),
  state: z.string().min(1),
});

linkedinRouter.get('/api/linkedin/callback', async (req, res, next) => {
  try {
    const { code, state } = callbackSchema.parse(req.query);
    const userId = verifyLinkedInState(state);
    const redirectUri = `${env.PUBLIC_BASE_URL}/api/linkedin/callback`;

    const tokens = await linkedInClient.exchangeAuthorizationCode(code, redirectUri);
    const profile = await linkedInClient.getUserInfo(tokens.accessToken);
    const memberUrn = `urn:li:person:${profile.sub}`;

    const [account] = await db
      .insert(linkedinAccounts)
      .values({
        userId,
        memberUrn,
        accessTokenEnc: encryptToken(tokens.accessToken),
        refreshTokenEnc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
        expiresAt: new Date(Date.now() + tokens.expiresInSeconds * 1000),
        scopes: tokens.scopes.join(','),
        linkedinApp: 'share',
      })
      .returning();

    const [author] = await db
      .insert(authors)
      .values({
        urn: memberUrn,
        type: 'person',
        displayName: profile.name,
        linkedinAccountId: account.id,
      })
      .returning();

    await db.insert(authorMembers).values({
      authorId: author.id,
      userId,
      canPublish: true,
    });

    res.json({ connected: true, author });
  } catch (err) {
    next(err);
  }
});
