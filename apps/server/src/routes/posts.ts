import { Router } from 'express';
import { z } from 'zod';

import { devUserMiddleware } from '../auth/devUser.js';
import { db } from '../db/client.js';
import { linkedInClient } from '../linkedin/index.js';
import { recordAuditEvent } from '../services/auditService.js';
import { getAuthorWithAccessToken, userCanPublishAsAuthor } from '../services/authorService.js';
import {
  approveDraft,
  attachImage,
  createDraft,
  getPost,
  listPosts,
  publishPost,
  schedulePost,
  updateDraft,
} from '../services/postService.js';

export const postsRouter = Router();

postsRouter.use(devUserMiddleware);

postsRouter.get('/api/posts', async (req, res, next) => {
  try {
    const authorId = typeof req.query.authorId === 'string' ? req.query.authorId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const rows = await listPosts(db, { authorId, status: status as never });
    res.json({ posts: rows });
  } catch (err) {
    next(err);
  }
});

postsRouter.get('/api/posts/:id', async (req, res, next) => {
  try {
    const row = await getPost(db, req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    res.json({ post: row });
  } catch (err) {
    next(err);
  }
});

const createDraftSchema = z.object({
  authorId: z.string().uuid(),
  text: z.string().min(1).max(3000),
});

postsRouter.post('/api/posts', async (req, res, next) => {
  try {
    const input = createDraftSchema.parse(req.body);
    const row = await createDraft(db, {
      authorId: input.authorId,
      createdBy: req.userId!,
      text: input.text,
      source: 'app',
    });
    res.status(201).json({ post: row });
  } catch (err) {
    next(err);
  }
});

const updateDraftSchema = z.object({
  text: z.string().min(1).max(3000).optional(),
});

postsRouter.patch('/api/posts/:id', async (req, res, next) => {
  try {
    const input = updateDraftSchema.parse(req.body);
    const row = await updateDraft(db, { draftId: req.params.id, ...input });
    res.json({ post: row });
  } catch (err) {
    next(err);
  }
});

const attachImageSchema = z.object({
  imageUrl: z.string().url(),
});

postsRouter.post('/api/posts/:id/image', async (req, res, next) => {
  try {
    const input = attachImageSchema.parse(req.body);
    const post = await getPost(db, req.params.id);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    const author = await getAuthorWithAccessToken(db, post.authorId);
    if (!author) {
      res.status(400).json({ error: 'Author has no connected LinkedIn account' });
      return;
    }

    const imageRes = await fetch(input.imageUrl);
    if (!imageRes.ok) {
      res.status(400).json({ error: `Could not fetch image: ${imageRes.status}` });
      return;
    }
    const contentType = imageRes.headers.get('content-type') ?? 'image/jpeg';
    const bytes = new Uint8Array(await imageRes.arrayBuffer());

    const { uploadUrl, imageUrn } = await linkedInClient.initializeImageUpload(
      author.accessToken,
      author.urn,
    );
    await linkedInClient.uploadImageBytes(uploadUrl, bytes, contentType);

    const row = await attachImage(db, req.params.id, { imageUrn });
    res.json({ post: row });
  } catch (err) {
    next(err);
  }
});

postsRouter.post('/api/posts/:id/approve', async (req, res, next) => {
  try {
    const row = await approveDraft(db, req.params.id, req.userId!);
    await recordAuditEvent(db, {
      userId: req.userId,
      action: 'approve_post',
      target: req.params.id,
      source: 'app',
    });
    res.json({ post: row });
  } catch (err) {
    next(err);
  }
});

const publishSchema = z.object({
  confirmText: z.string().min(1).max(30),
});

postsRouter.post('/api/posts/:id/publish', async (req, res, next) => {
  try {
    const input = publishSchema.parse(req.body);
    const post = await getPost(db, req.params.id);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    const canPublish = await userCanPublishAsAuthor(db, req.userId!, post.authorId);
    if (!canPublish) {
      res.status(403).json({ error: 'Not authorized to publish as this author' });
      return;
    }
    const row = await publishPost(db, { draftId: req.params.id, confirmText: input.confirmText });
    await recordAuditEvent(db, {
      userId: req.userId,
      action: 'publish_post',
      target: req.params.id,
      source: 'app',
      meta: { linkedinPostUrn: row?.linkedinPostUrn },
    });
    res.json({ post: row });
  } catch (err) {
    next(err);
  }
});

const scheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
});

postsRouter.post('/api/posts/:id/schedule', async (req, res, next) => {
  try {
    const input = scheduleSchema.parse(req.body);
    const row = await schedulePost(db, req.params.id, new Date(input.scheduledAt));
    res.json({ post: row });
  } catch (err) {
    next(err);
  }
});
