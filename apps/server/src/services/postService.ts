import { and, desc, eq } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { posts } from '../db/schema.js';
import type { PostSource, PostStatus } from '@tb-linkedin/shared';
import { linkedInClient } from '../linkedin/index.js';
import { getAuthorWithAccessToken } from './authorService.js';

export interface PostMedia {
  imageUrn: string;
}

export interface CreateDraftInput {
  authorId: string;
  createdBy: string;
  text: string;
  source: PostSource;
}

export async function createDraft(db: Database, input: CreateDraftInput) {
  const [row] = await db
    .insert(posts)
    .values({
      authorId: input.authorId,
      createdBy: input.createdBy,
      text: input.text,
      status: 'draft',
      source: input.source,
    })
    .returning();
  return row;
}

export interface UpdateDraftInput {
  draftId: string;
  text?: string;
}

export async function updateDraft(db: Database, input: UpdateDraftInput) {
  const [existing] = await db.select().from(posts).where(eq(posts.id, input.draftId)).limit(1);
  if (!existing) {
    throw new Error('Post not found');
  }
  if (existing.status !== 'draft') {
    throw new Error(`Cannot edit a post with status ${existing.status}`);
  }
  const [row] = await db
    .update(posts)
    .set({
      ...(input.text !== undefined ? { text: input.text } : {}),
      updatedAt: new Date(),
    })
    .where(eq(posts.id, input.draftId))
    .returning();
  return row;
}

export async function attachImage(db: Database, draftId: string, media: PostMedia) {
  const [existing] = await db.select().from(posts).where(eq(posts.id, draftId)).limit(1);
  if (!existing) {
    throw new Error('Post not found');
  }
  if (existing.status !== 'draft') {
    throw new Error(`Cannot attach media to a post with status ${existing.status}`);
  }
  const [row] = await db
    .update(posts)
    .set({ media, updatedAt: new Date() })
    .where(eq(posts.id, draftId))
    .returning();
  return row;
}

export interface ListPostsInput {
  authorId?: string;
  status?: PostStatus;
}

export async function listPosts(db: Database, input: ListPostsInput) {
  const conditions = [];
  if (input.authorId) conditions.push(eq(posts.authorId, input.authorId));
  if (input.status) conditions.push(eq(posts.status, input.status));

  return db
    .select()
    .from(posts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(posts.createdAt));
}

export async function getPost(db: Database, postId: string) {
  const [row] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  return row;
}

export async function approveDraft(db: Database, draftId: string, approvedBy: string) {
  const [existing] = await db.select().from(posts).where(eq(posts.id, draftId)).limit(1);
  if (!existing) {
    throw new Error('Post not found');
  }
  if (existing.status !== 'draft' && existing.status !== 'pending_approval') {
    throw new Error(`Cannot approve a post with status ${existing.status}`);
  }
  const [row] = await db
    .update(posts)
    .set({ status: 'approved', approvedBy, updatedAt: new Date() })
    .where(eq(posts.id, draftId))
    .returning();
  return row;
}

export interface PublishPostInput {
  draftId: string;
  confirmText: string;
}

/**
 * Publishes an approved draft to LinkedIn. `confirmText` must match the
 * first 30 characters of the post text — this is the confirmation gate
 * MCP clients (and the UI) must echo back before this runs.
 */
export async function publishPost(db: Database, input: PublishPostInput) {
  const [existing] = await db.select().from(posts).where(eq(posts.id, input.draftId)).limit(1);
  if (!existing) {
    throw new Error('Post not found');
  }
  const publishableStatuses: PostStatus[] = ['draft', 'pending_approval', 'approved'];
  if (!publishableStatuses.includes(existing.status as PostStatus)) {
    throw new Error(`Cannot publish a post with status ${existing.status}`);
  }
  const expectedConfirm = existing.text.slice(0, 30);
  if (input.confirmText !== expectedConfirm) {
    throw new Error('confirmText does not match the first 30 characters of the post');
  }

  const author = await getAuthorWithAccessToken(db, existing.authorId);
  if (!author) {
    throw new Error('Author has no connected LinkedIn account');
  }

  const media = existing.media as PostMedia | null;

  try {
    const result = await linkedInClient.createPost(author.accessToken, {
      authorUrn: author.urn,
      commentary: existing.text,
      imageUrn: media?.imageUrn,
    });
    const [row] = await db
      .update(posts)
      .set({
        status: 'published',
        linkedinPostUrn: result.postUrn,
        publishedAt: new Date(),
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, input.draftId))
      .returning();
    return row;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown LinkedIn publish error';
    await db
      .update(posts)
      .set({ status: 'failed', error: message, updatedAt: new Date() })
      .where(eq(posts.id, input.draftId));
    throw err;
  }
}

export async function schedulePost(db: Database, draftId: string, scheduledAt: Date) {
  const [existing] = await db.select().from(posts).where(eq(posts.id, draftId)).limit(1);
  if (!existing) {
    throw new Error('Post not found');
  }
  const schedulableStatuses: PostStatus[] = ['draft', 'pending_approval', 'approved'];
  if (!schedulableStatuses.includes(existing.status as PostStatus)) {
    throw new Error(`Cannot schedule a post with status ${existing.status}`);
  }
  const [row] = await db
    .update(posts)
    .set({ status: 'scheduled', scheduledAt, updatedAt: new Date() })
    .where(eq(posts.id, draftId))
    .returning();
  return row;
}
