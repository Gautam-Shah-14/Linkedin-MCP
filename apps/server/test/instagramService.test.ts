import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// These tests write to the database, so they only run against a local one
// (CI's service container or a dev Postgres) — never a remote DATABASE_URL.
const dbUrl = process.env.DATABASE_URL ?? '';
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

describe.skipIf(!isLocalDb)('instagram service (mock client)', () => {
  let db: typeof import('../src/db/client.js').db;
  let pool: typeof import('../src/db/client.js').pool;
  let svc: typeof import('../src/services/instagramService.js');
  let schema: typeof import('../src/db/schema.js');
  let userId: string;
  let accountId: string;

  beforeAll(async () => {
    process.env.INSTAGRAM_MOCK = 'true';
    process.env.JWT_SIGNING_KEY ??= 'test-signing-key';
    process.env.TOKEN_ENCRYPTION_KEY ??= 'mExeL01lOoBY0oxaUU35aYkLZE+3ucV+k2DKOdBADTc=';
    ({ db, pool } = await import('../src/db/client.js'));
    svc = await import('../src/services/instagramService.js');
    schema = await import('../src/db/schema.js');

    const [user] = await db
      .insert(schema.users)
      .values({ email: `ig-test-${Date.now()}@example.com`, passwordHash: 'x', name: 'IG Test' })
      .returning();
    userId = user!.id;
    const account = await svc.connectAccount(db, userId, 'mock-code', 'http://localhost/cb');
    accountId = account!.id;
  });

  afterAll(async () => {
    const { eq } = await import('drizzle-orm');
    // Accounts cascade to their posts; posts reference users without cascade, so delete accounts first.
    await db.delete(schema.instagramAccounts).where(eq(schema.instagramAccounts.userId, userId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  const IMAGE = 'https://example.com/pic.jpg';

  it('stores the access token encrypted and reconnecting reuses the row', async () => {
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(schema.instagramAccounts).where(eq(schema.instagramAccounts.id, accountId));
    expect(row!.accessTokenEnc).not.toContain('mock-ig');
    const again = await svc.connectAccount(db, userId, 'mock-code', 'http://localhost/cb');
    expect(again!.id).toBe(accountId);
  });

  it('rejects non-https image urls and over-long captions', async () => {
    const base = { accountId, createdBy: userId, source: 'test' };
    await expect(svc.createDraft(db, { ...base, caption: 'hi', imageUrl: 'http://example.com/a.jpg' })).rejects.toThrow(/https/);
    await expect(svc.createDraft(db, { ...base, caption: 'x'.repeat(2201), imageUrl: IMAGE })).rejects.toThrow(/caption/);
  });

  it('will not publish an unapproved draft', async () => {
    const draft = await svc.createDraft(db, { accountId, createdBy: userId, source: 'test', caption: 'Unapproved caption for test', imageUrl: IMAGE });
    await expect(svc.publishPost(db, { postId: draft!.id, confirmText: draft!.caption.slice(0, 30) })).rejects.toThrow(/approved first/);
  });

  it('requires matching confirmText, then publishes once', async () => {
    const draft = await svc.createDraft(db, { accountId, createdBy: userId, source: 'test', caption: 'Approved caption for the publish test', imageUrl: IMAGE });
    await svc.approveDraft(db, draft!.id, userId);
    await expect(svc.publishPost(db, { postId: draft!.id, confirmText: 'wrong' })).rejects.toThrow(/confirmText/);
    const published = await svc.publishPost(db, { postId: draft!.id, confirmText: draft!.caption.slice(0, 30) });
    expect(published!.status).toBe('published');
    expect(published!.igMediaId).toMatch(/^mock-media-/);
    await expect(svc.publishPost(db, { postId: draft!.id, confirmText: draft!.caption.slice(0, 30) })).rejects.toThrow(/approved first/);
  });

  it('sends an edited approved post back to draft', async () => {
    const draft = await svc.createDraft(db, { accountId, createdBy: userId, source: 'test', caption: 'Edit after approval caption', imageUrl: IMAGE });
    await svc.approveDraft(db, draft!.id, userId);
    const edited = await svc.updateDraft(db, draft!.id, { caption: 'Changed caption after approval' });
    expect(edited!.status).toBe('draft');
    expect(edited!.approvedBy).toBeNull();
  });
});
