import { Router } from 'express';
import { z } from 'zod';

import { devUserMiddleware } from '../auth/devUser.js';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { authorMembers, authors, linkedinAccounts } from '../db/schema.js';
import { encryptToken } from '../lib/crypto.js';
import { linkedInClient } from '../linkedin/index.js';

export const linkedinRouter = Router();

const AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';

linkedinRouter.get('/api/linkedin/connect', devUserMiddleware, (req, res) => {
  const redirectUri = `${env.PUBLIC_BASE_URL}/api/linkedin/callback`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.LINKEDIN_SHARE_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    scope: 'openid profile email w_member_social',
    state: req.userId!,
  });
  res.redirect(`${AUTHORIZE_URL}?${params.toString()}`);
});

const callbackSchema = z.object({
  code: z.string(),
  state: z.string().uuid(),
});

linkedinRouter.get('/api/linkedin/callback', async (req, res, next) => {
  try {
    const { code, state: userId } = callbackSchema.parse(req.query);
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
