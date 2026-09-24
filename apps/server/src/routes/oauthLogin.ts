import { Router } from 'express';
import { z } from 'zod';

import { loginWithPassword } from '../auth/appAuth.js';
import { consumePendingAuthorization, getPendingAuthorization, issueAuthorizationCode } from '../auth/oauthProvider.js';
import { renderLoginConsentPage } from '../auth/views/loginConsent.js';
import { db } from '../db/client.js';

export const oauthLoginRouter = Router();

oauthLoginRouter.get('/oauth/login', (req, res) => {
  const requestId = typeof req.query.request_id === 'string' ? req.query.request_id : undefined;
  const pending = requestId ? getPendingAuthorization(requestId) : undefined;
  if (!pending) {
    res.status(400).send('This authorization request has expired. Close this tab and try connecting again.');
    return;
  }
  res.set('Content-Type', 'text/html').send(
    renderLoginConsentPage({
      requestId: requestId!,
      clientName: pending.client.client_name ?? pending.client.client_id,
      scope: pending.params.scopes?.join(' ') ?? '',
    }),
  );
});

const loginBodySchema = z.object({
  request_id: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(1),
});

oauthLoginRouter.post('/oauth/login', async (req, res) => {
  const parsed = loginBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).send('Invalid form submission.');
    return;
  }
  const { request_id: requestId, email, password } = parsed.data;
  const pending = getPendingAuthorization(requestId);
  if (!pending) {
    res.status(400).send('This authorization request has expired. Close this tab and try connecting again.');
    return;
  }

  try {
    const { user } = await loginWithPassword(db, email, password);
    consumePendingAuthorization(requestId);

    const { client, params } = pending;
    const code = await issueAuthorizationCode(db, {
      clientId: client.client_id,
      userId: user.id,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      scope: params.scopes?.join(' ') ?? 'mcp',
    });

    const redirect = new URL(params.redirectUri);
    redirect.searchParams.set('code', code);
    if (params.state) redirect.searchParams.set('state', params.state);
    res.redirect(redirect.toString());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sign in failed';
    res.set('Content-Type', 'text/html').status(401).send(
      renderLoginConsentPage({
        requestId,
        clientName: pending.client.client_name ?? pending.client.client_id,
        scope: pending.params.scopes?.join(' ') ?? '',
        error: message,
      }),
    );
  }
});
