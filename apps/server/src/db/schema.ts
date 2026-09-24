import { relations } from 'drizzle-orm';
import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
    ...timestamps,
  },
  (table) => [uniqueIndex('users_email_idx').on(table.email)],
);

export const linkedinAccounts = pgTable('linkedin_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  memberUrn: text('member_urn').notNull(),
  accessTokenEnc: text('access_token_enc').notNull(),
  refreshTokenEnc: text('refresh_token_enc'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  scopes: text('scopes').notNull(),
  linkedinApp: text('linkedin_app', { enum: ['share', 'community'] }).notNull(),
  ...timestamps,
});

export const authors = pgTable('authors', {
  id: uuid('id').primaryKey().defaultRandom(),
  urn: text('urn').notNull(),
  type: text('type', { enum: ['person', 'organization'] }).notNull(),
  displayName: text('display_name').notNull(),
  linkedinAccountId: uuid('linkedin_account_id')
    .notNull()
    .references(() => linkedinAccounts.id, { onDelete: 'cascade' }),
  ...timestamps,
});

export const authorMembers = pgTable('author_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id')
    .notNull()
    .references(() => authors.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  canPublish: boolean('can_publish').notNull().default(false),
  ...timestamps,
});

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id')
    .notNull()
    .references(() => authors.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  approvedBy: uuid('approved_by').references(() => users.id),
  text: text('text').notNull(),
  media: jsonb('media'),
  status: text('status', {
    enum: ['draft', 'pending_approval', 'approved', 'scheduled', 'published', 'failed'],
  })
    .notNull()
    .default('draft'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  linkedinPostUrn: text('linkedin_post_urn'),
  error: text('error'),
  source: text('source', { enum: ['app', 'mcp_app', 'mcp_claude'] }).notNull(),
  ...timestamps,
});

export const oauthClients = pgTable(
  'oauth_clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: text('client_id').notNull(),
    clientSecretHash: text('client_secret_hash'),
    redirectUris: jsonb('redirect_uris').notNull(),
    name: text('name').notNull(),
    // Full RFC 7591 OAuthClientInformationFull as registered, so we don't
    // reshape it on every read/write.
    data: jsonb('data').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('oauth_clients_client_id_idx').on(table.clientId)],
);

export const oauthCodes = pgTable('oauth_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  codeHash: text('code_hash').notNull(),
  clientId: text('client_id').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  codeChallenge: text('code_challenge').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  scope: text('scope').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps,
});

export const oauthRefreshTokens = pgTable('oauth_refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull(),
  clientId: text('client_id').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ...timestamps,
});

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  action: text('action').notNull(),
  target: text('target').notNull(),
  source: text('source').notNull(),
  meta: jsonb('meta'),
  ...timestamps,
});

export const usersRelations = relations(users, ({ many }) => ({
  linkedinAccounts: many(linkedinAccounts),
  authorMembers: many(authorMembers),
}));

export const linkedinAccountsRelations = relations(linkedinAccounts, ({ one, many }) => ({
  user: one(users, { fields: [linkedinAccounts.userId], references: [users.id] }),
  authors: many(authors),
}));

export const authorsRelations = relations(authors, ({ one, many }) => ({
  linkedinAccount: one(linkedinAccounts, {
    fields: [authors.linkedinAccountId],
    references: [linkedinAccounts.id],
  }),
  members: many(authorMembers),
  posts: many(posts),
}));

export const authorMembersRelations = relations(authorMembers, ({ one }) => ({
  author: one(authors, { fields: [authorMembers.authorId], references: [authors.id] }),
  user: one(users, { fields: [authorMembers.userId], references: [users.id] }),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(authors, { fields: [posts.authorId], references: [authors.id] }),
  creator: one(users, { fields: [posts.createdBy], references: [users.id] }),
  approver: one(users, { fields: [posts.approvedBy], references: [users.id] }),
}));
