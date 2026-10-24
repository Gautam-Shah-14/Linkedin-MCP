import { Router } from 'express';
import { z } from 'zod';

import { loginWithPassword } from '../auth/appAuth.js';
import { devUserMiddleware } from '../auth/devUser.js';
import { renderConnectLoginPage } from '../auth/views/connectLogin.js';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { instagramClient } from '../instagram/index.js';
import { signConnectState, verifyConnectState } from '../lib/jwt.js';
import { recordAuditEvent } from '../services/auditService.js';
import {
  approveDraft,
  connectAccount,
  createDraft,
  getPost,
  INSTAGRAM_CAPTION_MAX,
  listAccountsForUser,
  listPosts,
  publishPost,
  updateDraft,
  userOwnsAccount,
} from '../services/instagramService.js';

export const instagramRouter = Router();

const STATE_PURPOSE = 'instagram_connect';
const callbackUrl = () => `${env.PUBLIC_BASE_URL}/api/instagram/callback`;

const loginPage = (error?: string) =>
  renderConnectLoginPage({ error, provider: 'Instagram', action: '/instagram/connect' });

// Browser flow: sign in, then continue to Instagram's consent screen.
instagramRouter.get('/instagram/connect', (_req, res) => {
  res.set('Content-Type', 'text/html').send(loginPage());
});

const connectLoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

instagramRouter.post('/instagram/connect', async (req, res) => {
  const parsed = connectLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).set('Content-Type', 'text/html').send(loginPage('Invalid form submission.'));
    return;
  }
  try {
    const { user } = await loginWithPassword(db, parsed.data.email, parsed.data.password);
    const state = signConnectState(user.id, STATE_PURPOSE);
    res.redirect(instagramClient.buildAuthorizeUrl(callbackUrl(), state));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sign in failed';
    res.status(401).set('Content-Type', 'text/html').send(loginPage(message));
  }
});

// API flow for non-browser clients (dev-only X-User-Id until real bearer auth lands).
instagramRouter.get('/api/instagram/connect', devUserMiddleware, (req, res) => {
  const state = signConnectState(req.userId!, STATE_PURPOSE);
  res.redirect(instagramClient.buildAuthorizeUrl(callbackUrl(), state));
});

const callbackSchema = z.object({ code: z.string().min(1), state: z.string().min(1) });

instagramRouter.get('/api/instagram/callback', async (req, res, next) => {
  try {
    if (req.query.error) {
      res.status(400).json({ error: `Instagram authorization was not completed: ${String(req.query.error)}` });
      return;
    }
    const { code, state } = callbackSchema.parse(req.query);
    const userId = verifyConnectState(state, STATE_PURPOSE);
    const account = await connectAccount(db, userId, code, callbackUrl());
    res.json({ connected: true, account: { id: account?.id, username: account?.username } });
  } catch (err) {
    next(err);
  }
});

instagramRouter.get('/api/instagram/accounts', devUserMiddleware, async (req, res, next) => {
  try {
    res.json({ accounts: await listAccountsForUser(db, req.userId!) });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  accountId: z.string().uuid(),
  caption: z.string().min(1).max(INSTAGRAM_CAPTION_MAX),
  imageUrl: z.string().url(),
});

instagramRouter.post('/api/instagram/posts', devUserMiddleware, async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    if (!(await userOwnsAccount(db, req.userId!, input.accountId))) {
      res.status(403).json({ error: 'Not your Instagram account' });
      return;
    }
    const post = await createDraft(db, { ...input, createdBy: req.userId!, source: 'app' });
    res.status(201).json({ post });
  } catch (err) {
    next(err);
  }
});

instagramRouter.get('/api/instagram/posts', devUserMiddleware, async (req, res, next) => {
  try {
    const accounts = await listAccountsForUser(db, req.userId!);
    const posts = await listPosts(db, { accountIds: accounts.map((a) => a.id) });
    res.json({ posts });
  } catch (err) {
    next(err);
  }
});

type OwnedPost =
  | { ok: true; post: NonNullable<Awaited<ReturnType<typeof getPost>>> }
  | { ok: false; status: number; message: string };

async function loadOwnedPost(req: { params: { id?: string }; userId?: string }): Promise<OwnedPost> {
  const post = await getPost(db, req.params.id ?? '');
  if (!post) return { ok: false, status: 404, message: 'Post not found' };
  if (!(await userOwnsAccount(db, req.userId!, post.accountId))) {
    return { ok: false, status: 403, message: 'Not your Instagram account' };
  }
  return { ok: true, post };
}

const updateSchema = z.object({
  caption: z.string().min(1).max(INSTAGRAM_CAPTION_MAX).optional(),
  imageUrl: z.string().url().optional(),
});

instagramRouter.patch('/api/instagram/posts/:id', devUserMiddleware, async (req, res, next) => {
  try {
    const loaded = await loadOwnedPost(req);
    if (!loaded.ok) {
      res.status(loaded.status).json({ error: loaded.message });
      return;
    }
    res.json({ post: await updateDraft(db, loaded.post.id, updateSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
});

instagramRouter.post('/api/instagram/posts/:id/approve', devUserMiddleware, async (req, res, next) => {
  try {
    const loaded = await loadOwnedPost(req);
    if (!loaded.ok) {
      res.status(loaded.status).json({ error: loaded.message });
      return;
    }
    const post = await approveDraft(db, loaded.post.id, req.userId!);
    await recordAuditEvent(db, {
      userId: req.userId,
      action: 'instagram_approve_post',
      target: loaded.post.id,
      source: 'app',
    });
    res.json({ post });
  } catch (err) {
    next(err);
  }
});

const publishSchema = z.object({ confirmText: z.string().min(1).max(30) });

instagramRouter.post('/api/instagram/posts/:id/publish', devUserMiddleware, async (req, res, next) => {
  try {
    const input = publishSchema.parse(req.body);
    const loaded = await loadOwnedPost(req);
    if (!loaded.ok) {
      res.status(loaded.status).json({ error: loaded.message });
      return;
    }
    const post = await publishPost(db, { postId: loaded.post.id, confirmText: input.confirmText });
    await recordAuditEvent(db, {
      userId: req.userId,
      action: 'instagram_publish_post',
      target: loaded.post.id,
      source: 'app',
      meta: { igMediaId: post?.igMediaId },
    });
    res.json({ post });
  } catch (err) {
    next(err);
  }
});
