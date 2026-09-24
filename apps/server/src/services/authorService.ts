import { and, eq } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { authorMembers, authors, linkedinAccounts } from '../db/schema.js';
import { decryptToken } from '../lib/crypto.js';

export interface AuthorSummary {
  id: string;
  urn: string;
  type: 'person' | 'organization';
  displayName: string;
  canPublish: boolean;
}

/** Authors the given user is a member of (per author_members). */
export async function listAuthorsForUser(db: Database, userId: string): Promise<AuthorSummary[]> {
  const rows = await db
    .select({
      id: authors.id,
      urn: authors.urn,
      type: authors.type,
      displayName: authors.displayName,
      canPublish: authorMembers.canPublish,
    })
    .from(authorMembers)
    .innerJoin(authors, eq(authorMembers.authorId, authors.id))
    .where(eq(authorMembers.userId, userId));

  return rows;
}

export async function userIsAuthorMember(
  db: Database,
  userId: string,
  authorId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: authorMembers.id })
    .from(authorMembers)
    .where(and(eq(authorMembers.userId, userId), eq(authorMembers.authorId, authorId)))
    .limit(1);
  return Boolean(row);
}

export async function userCanPublishAsAuthor(
  db: Database,
  userId: string,
  authorId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ canPublish: authorMembers.canPublish })
    .from(authorMembers)
    .where(and(eq(authorMembers.userId, userId), eq(authorMembers.authorId, authorId)))
    .limit(1);
  return row?.canPublish ?? false;
}

export interface AuthorWithAccessToken {
  id: string;
  urn: string;
  accessToken: string;
}

/** Resolves an author's LinkedIn URN and a decrypted, usable access token. */
export async function getAuthorWithAccessToken(
  db: Database,
  authorId: string,
): Promise<AuthorWithAccessToken | undefined> {
  const [row] = await db
    .select({
      id: authors.id,
      urn: authors.urn,
      accessTokenEnc: linkedinAccounts.accessTokenEnc,
      expiresAt: linkedinAccounts.expiresAt,
    })
    .from(authors)
    .innerJoin(linkedinAccounts, eq(authors.linkedinAccountId, linkedinAccounts.id))
    .where(eq(authors.id, authorId))
    .limit(1);

  if (!row) {
    return undefined;
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw new Error('LinkedIn connection expired, reconnect');
  }

  return {
    id: row.id,
    urn: row.urn,
    accessToken: decryptToken(row.accessTokenEnc),
  };
}
