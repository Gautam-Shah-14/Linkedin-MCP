import { and, desc, eq } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { instagramAccounts, instagramPosts } from '../db/schema.js';
import { decryptToken, encryptToken } from '../lib/crypto.js';
import { instagramClient } from '../instagram/index.js';

export const INSTAGRAM_CAPTION_MAX = 2200;
const CONFIRM_TEXT_LENGTH = 30;
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_TOKEN_AGE_BEFORE_REFRESH_MS = 24 * 60 * 60 * 1000;

export type InstagramPostStatus = 'draft' | 'approved' | 'publishing' | 'published' | 'failed';

export interface InstagramAccountSummary {
  id: string;
  igUserId: string;
  username: string;
}

/** Instagram fetches the image itself, so it must be a public https URL (JPEG only). */
export function assertValidImageUrl(imageUrl: string): void {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    throw new Error('imageUrl must be a valid URL');
  }
  if (url.protocol !== 'https:') {
    throw new Error('imageUrl must use https');
  }
}

function assertValidCaption(caption: string): void {
  if (caption.length === 0 || caption.length > INSTAGRAM_CAPTION_MAX) {
    throw new Error(`caption must be 1-${INSTAGRAM_CAPTION_MAX} characters`);
  }
}

/** Stores (or refreshes) the Instagram account a user connected. Reconnecting updates the same row. */
export async function connectAccount(
  db: Database,
  userId: string,
  code: string,
  redirectUri: string,
) {
  const short = await instagramClient.exchangeAuthorizationCode(code, redirectUri);
  const long = await instagramClient.exchangeForLongLivedToken(short.accessToken);
  const profile = await instagramClient.getProfile(long.accessToken);
  const igUserId = short.userId ?? profile.userId;

  const [existing] = await db
    .select()
    .from(instagramAccounts)
    .where(eq(instagramAccounts.igUserId, igUserId))
    .limit(1);
  if (existing && existing.userId !== userId) {
    throw new Error('This Instagram account is already connected to another user');
  }

  const values = {
    userId,
    igUserId,
    username: profile.username,
    accessTokenEnc: encryptToken(long.accessToken),
    expiresAt: new Date(Date.now() + (long.expiresInSeconds ?? 60 * 24 * 60 * 60) * 1000),
    scopes: short.scopes.join(','),
    updatedAt: new Date(),
  };

  if (existing) {
    const [row] = await db
      .update(instagramAccounts)
      .set(values)
      .where(eq(instagramAccounts.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db.insert(instagramAccounts).values(values).returning();
  return row;
}

export async function listAccountsForUser(
  db: Database,
  userId: string,
): Promise<InstagramAccountSummary[]> {
  return db
    .select({
      id: instagramAccounts.id,
      igUserId: instagramAccounts.igUserId,
      username: instagramAccounts.username,
    })
    .from(instagramAccounts)
    .where(eq(instagramAccounts.userId, userId));
}

export async function userOwnsAccount(
  db: Database,
  userId: string,
  accountId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: instagramAccounts.id })
    .from(instagramAccounts)
    .where(and(eq(instagramAccounts.id, accountId), eq(instagramAccounts.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function getPost(db: Database, postId: string) {
  const [row] = await db.select().from(instagramPosts).where(eq(instagramPosts.id, postId)).limit(1);
  return row;
}

export async function createDraft(
  db: Database,
  input: { accountId: string; createdBy: string; caption: string; imageUrl: string; source: string },
) {
  assertValidCaption(input.caption);
  assertValidImageUrl(input.imageUrl);
  const [row] = await db
    .insert(instagramPosts)
    .values({
      accountId: input.accountId,
      createdBy: input.createdBy,
      caption: input.caption,
      imageUrl: input.imageUrl,
      status: 'draft',
      source: input.source,
    })
    .returning();
  return row;
}

/** Editing resets approval: an approved post that changes must be approved again. A failed post can be edited to retry. */
export async function updateDraft(
  db: Database,
  postId: string,
  changes: { caption?: string; imageUrl?: string },
) {
  const existing = await getPost(db, postId);
  if (!existing) {
    throw new Error('Post not found');
  }
  if (existing.status !== 'draft' && existing.status !== 'approved' && existing.status !== 'failed') {
    throw new Error(`Cannot edit a post with status ${existing.status}`);
  }
  if (changes.caption !== undefined) assertValidCaption(changes.caption);
  if (changes.imageUrl !== undefined) assertValidImageUrl(changes.imageUrl);
  const [row] = await db
    .update(instagramPosts)
    .set({
      caption: changes.caption ?? existing.caption,
      imageUrl: changes.imageUrl ?? existing.imageUrl,
      status: 'draft',
      approvedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(instagramPosts.id, postId))
    .returning();
  return row;
}

export async function approveDraft(db: Database, postId: string, approvedBy: string) {
  const existing = await getPost(db, postId);
  if (!existing) {
    throw new Error('Post not found');
  }
  if (existing.status !== 'draft') {
    throw new Error(`Cannot approve a post with status ${existing.status}`);
  }
  const [row] = await db
    .update(instagramPosts)
    .set({ status: 'approved', approvedBy, updatedAt: new Date() })
    .where(and(eq(instagramPosts.id, postId), eq(instagramPosts.status, 'draft')))
    .returning();
  if (!row) {
    throw new Error('Post changed while approving, try again');
  }
  return row;
}

export async function listPosts(
  db: Database,
  filter: { accountIds: string[]; status?: InstagramPostStatus },
) {
  const rows = await db
    .select()
    .from(instagramPosts)
    .where(filter.status ? eq(instagramPosts.status, filter.status) : undefined)
    .orderBy(desc(instagramPosts.createdAt))
    .limit(200);
  const allowed = new Set(filter.accountIds);
  return rows.filter((row) => allowed.has(row.accountId));
}

/** Decrypts the account's token, refreshing it first when it is close to expiry. */
async function getAccessToken(db: Database, accountId: string): Promise<{ accessToken: string; igUserId: string }> {
  const [account] = await db
    .select()
    .from(instagramAccounts)
    .where(eq(instagramAccounts.id, accountId))
    .limit(1);
  if (!account) {
    throw new Error('Instagram account not found');
  }
  const now = Date.now();
  if (account.expiresAt.getTime() <= now) {
    throw new Error('Instagram connection expired, reconnect');
  }
  let accessToken = decryptToken(account.accessTokenEnc);

  const expiresSoon = account.expiresAt.getTime() - now < REFRESH_WINDOW_MS;
  const oldEnough = now - account.updatedAt.getTime() > MIN_TOKEN_AGE_BEFORE_REFRESH_MS;
  if (expiresSoon && oldEnough) {
    try {
      const refreshed = await instagramClient.refreshLongLivedToken(accessToken);
      accessToken = refreshed.accessToken;
      await db
        .update(instagramAccounts)
        .set({
          accessTokenEnc: encryptToken(accessToken),
          expiresAt: new Date(now + (refreshed.expiresInSeconds ?? 60 * 24 * 60 * 60) * 1000),
          updatedAt: new Date(),
        })
        .where(eq(instagramAccounts.id, accountId));
    } catch {
      // The old token is still valid for now; publishing can proceed.
    }
  }
  return { accessToken, igUserId: account.igUserId };
}

export interface PublishInstagramInput {
  postId: string;
  confirmText: string;
  /** Delay between container status checks. */
  pollIntervalMs?: number;
  maxPolls?: number;
}

/**
 * Publishes an approved post. `confirmText` must equal the first 30 characters
 * of the caption so whoever approves the tool call can see what goes live.
 * The post is claimed (approved -> publishing) atomically so it cannot publish twice.
 */
export async function publishPost(db: Database, input: PublishInstagramInput) {
  const existing = await getPost(db, input.postId);
  if (!existing) {
    throw new Error('Post not found');
  }
  if (existing.status !== 'approved') {
    throw new Error(`Cannot publish a post with status ${existing.status}: it must be approved first`);
  }
  if (input.confirmText !== existing.caption.slice(0, CONFIRM_TEXT_LENGTH)) {
    throw new Error('confirmText does not match the first 30 characters of the caption');
  }

  const [claimed] = await db
    .update(instagramPosts)
    .set({ status: 'publishing', updatedAt: new Date() })
    .where(and(eq(instagramPosts.id, input.postId), eq(instagramPosts.status, 'approved')))
    .returning();
  if (!claimed) {
    throw new Error('Post is already being published');
  }

  try {
    const { accessToken, igUserId } = await getAccessToken(db, claimed.accountId);
    const { containerId } = await instagramClient.createImageContainer(accessToken, igUserId, {
      imageUrl: claimed.imageUrl,
      caption: claimed.caption,
    });

    const maxPolls = input.maxPolls ?? 10;
    const interval = input.pollIntervalMs ?? 3000;
    let status = await instagramClient.getContainerStatus(accessToken, containerId);
    for (let i = 1; status === 'IN_PROGRESS' && i < maxPolls; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      status = await instagramClient.getContainerStatus(accessToken, containerId);
    }
    if (status !== 'FINISHED') {
      throw new Error(`Instagram did not finish processing the image (status ${status})`);
    }

    const { mediaId } = await instagramClient.publishContainer(accessToken, igUserId, containerId);
    const [row] = await db
      .update(instagramPosts)
      .set({ status: 'published', igMediaId: mediaId, publishedAt: new Date(), error: null, updatedAt: new Date() })
      .where(eq(instagramPosts.id, input.postId))
      .returning();
    return row;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Instagram publish error';
    await db
      .update(instagramPosts)
      .set({ status: 'failed', error: message, updatedAt: new Date() })
      .where(eq(instagramPosts.id, input.postId));
    throw err;
  }
}
