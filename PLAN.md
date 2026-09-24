# LinkedIn MCP Server + App — Development Plan

> Working name: `tb-linkedin` (rename freely).
> Goal: one cloud-hosted server that exposes LinkedIn actions as MCP tools (plus plain REST), used by **(a)** our own app and **(b)** claude.ai as a custom connector.

---

## 1. Scope

### v1 (build this)
- Post to the **TokenBurners LinkedIn Company Page** and to **team members' personal profiles**.
- Draft → review → publish flow. AI can draft freely. Publishing always needs an explicit human step.
- Scheduled posts.
- Company page analytics and comments. These need **Community Management API** approval, so they come in a later phase.
- Two clients: our Next.js app (AI assistant + normal UI) and claude.ai custom connector.

### Out of scope (on purpose)
- Messaging, connection requests, profile/people search, scraping. These are partner-gated or against LinkedIn's User Agreement. **Official APIs only**: no cookies, no browser automation.
- Multi-tenant SaaS (outside users connecting their own pages). Schema is org-scoped so it can grow into this, but LinkedIn review and product decisions come first. See §13.

---

## 2. Architecture

```
                         ┌──────────────────────────────────────────┐
 Next.js app (Vercel)    │  apps/server  (Render, always-on)        │
  ├─ UI buttons ───REST─▶│   /api/*    REST routes                  │
  └─ /api/assistant      │   /mcp      MCP (Streamable HTTP)        │──▶ LinkedIn REST API
       Groq + MCP client─▶│   /oauth/*  OAuth 2.1 (PKCE + DCR)       │    (Posts, Images,
                         │   /.well-known/*  discovery metadata      │     Org stats)
 claude.ai ──────MCP────▶│                                          │
 (custom connector)      │   services/  ← shared business logic     │
                         │   linkedin/  ← thin LinkedIn client      │
                         │   jobs/      ← scheduler                 │
                         └───────────────┬──────────────────────────┘
                                         │
                              Supabase Postgres (DATABASE_URL)
```

Key rule: **MCP tools and REST routes are both thin wrappers over `services/`.** No LinkedIn logic lives in either layer.

---

## 3. Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript, Node 20+ | ESM |
| Server framework | Express | The MCP TS SDK's auth helpers (`mcpAuthRouter`, `requireBearerAuth`) are Express-based |
| MCP | `@modelcontextprotocol/sdk` | Streamable HTTP transport (not SSE) |
| DB | Supabase Postgres, direct via `DATABASE_URL` | No Supabase Auth. Our own auth. |
| ORM / migrations | Drizzle ORM + drizzle-kit | Typed schema, SQL migrations in repo |
| Validation | Zod | Shared with MCP tool input schemas |
| App | Next.js (App Router) on Vercel | Server-side route handlers talk to the server |
| AI in app | Groq, Llama 3.3 70B, tool calling | MCP client in the Next.js route handler. Swap-in option: Claude Messages API `mcp_servers` (§9) |
| Auth | Own users table, bcrypt, JWT access tokens | Same token type for app and MCP OAuth (§8) |
| Token encryption | AES-256-GCM (node `crypto`) | LinkedIn tokens encrypted at rest |
| Scheduler | In-process worker polling `posts` every minute | Needs always-on instance |
| Logging | pino | Never log tokens |
| Hosting | Render web service, **paid Starter** (always-on) | Free tier sleeps → claude.ai and cron calls time out |
| Domain | `mcp.tokenburners.co.in` → Render (CNAME at GoDaddy) | Looks trustworthy on consent screens |

---

## 4. Repo structure (npm workspaces monorepo)

```
tb-linkedin/
├─ CLAUDE.md                     # conventions for Claude Code (see §14)
├─ PLAN.md                       # this file
├─ package.json                  # workspaces: apps/*, packages/*
├─ packages/
│  └─ shared/                    # zod schemas, types, constants shared by server + web
├─ apps/
│  ├─ server/
│  │  ├─ src/
│  │  │  ├─ index.ts             # express app, mounts routers
│  │  │  ├─ config/env.ts        # zod-validated env
│  │  │  ├─ db/
│  │  │  │  ├─ schema.ts
│  │  │  │  ├─ client.ts
│  │  │  │  └─ migrations/
│  │  │  ├─ lib/
│  │  │  │  ├─ crypto.ts          # encrypt/decrypt LinkedIn tokens
│  │  │  │  ├─ jwt.ts
│  │  │  │  └─ logger.ts
│  │  │  ├─ linkedin/            # thin API client, no business rules
│  │  │  │  ├─ http.ts           # fetch wrapper: version header, retries, 429 backoff
│  │  │  │  ├─ oauth.ts          # 3-legged flow, token exchange, userinfo
│  │  │  │  ├─ posts.ts          # create / get / delete post
│  │  │  │  ├─ images.ts         # initializeUpload + PUT
│  │  │  │  ├─ orgs.ts           # admin orgs, org stats  (phase 5)
│  │  │  │  ├─ comments.ts       # list / reply           (phase 5)
│  │  │  │  └─ littleText.ts     # escape commentary text (§11)
│  │  │  ├─ services/
│  │  │  │  ├─ authorService.ts  # which authors a user may post as
│  │  │  │  ├─ postService.ts    # draft, update, approve, publish, schedule
│  │  │  │  ├─ statsService.ts
│  │  │  │  └─ auditService.ts
│  │  │  ├─ auth/
│  │  │  │  ├─ appAuth.ts        # register/login → access token
│  │  │  │  ├─ oauthProvider.ts  # DB-backed OAuth provider for MCP clients
│  │  │  │  └─ views/            # login + consent HTML for /oauth/authorize
│  │  │  ├─ mcp/
│  │  │  │  ├─ server.ts         # builds McpServer, registers tools
│  │  │  │  ├─ transport.ts      # Streamable HTTP handler on /mcp
│  │  │  │  └─ tools/*.ts        # one file per tool
│  │  │  ├─ routes/              # REST: /api/posts, /api/authors, /api/linkedin/connect…
│  │  │  └─ jobs/scheduler.ts
│  │  └─ test/
│  └─ web/                       # Next.js app
│     ├─ app/
│     │  ├─ (auth)/login
│     │  ├─ dashboard/           # drafts, scheduled, published
│     │  ├─ connect/             # connect LinkedIn account / page
│     │  └─ api/assistant/route.ts   # Groq + MCP client loop
│     └─ lib/
│        ├─ serverApi.ts         # REST client to apps/server
│        └─ mcpClient.ts         # StreamableHTTPClientTransport wrapper
```

---

## 5. Data model

All tables have `id uuid pk`, `created_at`, `updated_at`.

| Table | Key columns | Purpose |
|---|---|---|
| `users` | email (unique), password_hash, name, role (`admin`/`member`) | Team members |
| `linkedin_accounts` | user_id, member_urn, access_token_enc, refresh_token_enc (nullable), expires_at, scopes, linkedin_app (`share`/`community`) | One row per user per LinkedIn app |
| `authors` | urn (`urn:li:person:…` / `urn:li:organization:…`), type, display_name, linkedin_account_id | Who a post can be published as |
| `author_members` | author_id, user_id, can_publish (bool) | Who in the team may use which author |
| `posts` | author_id, created_by, approved_by, text, media (jsonb), status, scheduled_at, published_at, linkedin_post_urn, error, source (`app`/`mcp_app`/`mcp_claude`) | Drafts through published |
| `oauth_clients` | client_id, client_secret_hash (nullable), redirect_uris, name | Dynamic Client Registration (claude.ai registers here) |
| `oauth_codes` | code_hash, client_id, user_id, code_challenge, redirect_uri, scope, expires_at | Short-lived auth codes |
| `oauth_refresh_tokens` | token_hash, client_id, user_id, expires_at, revoked_at | Refresh tokens we issue |
| `audit_log` | user_id, action, target, source, meta (jsonb) | Every publish/delete/approve |

**Post status machine:** `draft → pending_approval → approved → scheduled → published`, with `failed` reachable from `scheduled`/`approved`. `approved → published` only happens through a human action or the scheduler.

---

## 6. MCP tools

Tool annotations are required. Write tools set `destructiveHint: true`, so Claude asks before calling them.

| Tool | Type | Phase | Does |
|---|---|---|---|
| `list_authors` | read | 2 | Authors the current user may post as |
| `create_draft` | write (safe) | 2 | Creates a `draft` post. Returns id + formatted preview. **Never publishes.** |
| `update_draft` | write (safe) | 2 | Edits text/media of a draft |
| `list_posts` | read | 2 | Filter by author, status, date |
| `attach_image` | write (safe) | 2 | Takes an image URL, uploads to LinkedIn, attaches to a draft |
| `publish_post` | **write, destructive** | 3 | Publishes an approved draft. Requires `draft_id` + `confirm_text` equal to the first 30 chars of the post, so the model must echo what it's publishing |
| `schedule_post` | **write, destructive** | 4 | Sets `scheduled_at` on an approved draft |
| `get_post_stats` | read | 5 | Org posts only (Community Management) |
| `list_comments` | read | 5 | Org posts only |
| `reply_to_comment` | **write, destructive** | 5 | Org posts only |

Rules:
- **In our app**, the AI assistant only gets read + safe-write tools (no `publish_post` / `schedule_post`). Publishing is a UI button calling REST.
- **In claude.ai**, `publish_post` is exposed but gated by the destructive hint, `confirm_text`, and `author_members.can_publish`.
- Tool results stay small: ids, previews, counts. Never raw LinkedIn payloads.

---

## 7. LinkedIn integration

### Two LinkedIn developer apps (LinkedIn requires this)
1. **App A: "TokenBurners Share"**: products *Sign In with LinkedIn using OpenID Connect* + *Share on LinkedIn*. Auto-enabled. Scopes: `openid profile email w_member_social`. Covers posting as a person.
2. **App B: "TokenBurners Community"**: product *Community Management API* **only** (must be the sole product on the app). Needs review: legal entity, use case, verified Company Page. Scopes: `w_organization_social r_organization_social rw_organization_admin`. **Apply in Phase 0.** Review takes time.

Both apps get redirect URL `https://mcp.tokenburners.co.in/api/linkedin/callback` (plus `http://localhost:4000/api/linkedin/callback` for dev).

### API notes (verify each against current LinkedIn docs while building)
- Base: `https://api.linkedin.com/rest/…`. Every call sends `LinkedIn-Version: YYYYMM` and `X-Restli-Protocol-Version: 2.0.0`. Keep the version in env. LinkedIn retires versions after about a year.
- Person URN: from `GET https://api.linkedin.com/v2/userinfo` → `sub` → `urn:li:person:{sub}`.
- Create post: `POST /rest/posts` with `author`, `commentary`, `visibility: PUBLIC`, `distribution`, `lifecycleState: PUBLISHED`. The new post URN comes back in the `x-restli-id` response header.
- Images: `POST /rest/images?action=initializeUpload` → `PUT` bytes to the returned upload URL → reference the image URN in the post.
- Tokens: access tokens last about 60 days. Refresh tokens may not be issued for App A. Build a **re-connect reminder** (in-app banner + daily check) when `expires_at` < 7 days.
- Handle 429 with exponential backoff. Surface 401 as "LinkedIn connection expired, reconnect".

---

## 8. Auth design

One token format for everything: **short-lived JWT access tokens (1h) signed by the server**, with `sub = user_id`, `client_id`, `scope`.

- **App login:** `POST /api/auth/login` → email + password (bcrypt) → access token + refresh token (httpOnly cookie on web).
- **MCP OAuth for claude.ai** (MCP auth spec: OAuth 2.1, PKCE, Dynamic Client Registration):
  - `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`
  - `/oauth/register` (DCR), `/oauth/authorize` (our login + consent page), `/oauth/token`, `/oauth/revoke`
  - Implement with the MCP SDK's `mcpAuthRouter` + a custom provider backed by our tables.
  - `/mcp` protected by `requireBearerAuth`. Unauthenticated requests get `401` with `WWW-Authenticate: Bearer resource_metadata="…"`.
  - Allow claude.ai's callback redirect URI (`https://claude.ai/api/mcp/auth_callback`). Confirm the current value in Anthropic's docs.
- **App → /mcp:** the Next.js backend forwards the logged-in user's access token as `Authorization: Bearer`. Same verification path as claude.ai.
- **LinkedIn tokens never leave the server.** Clients only ever hold our tokens.

---

## 9. App AI assistant flow (`apps/web/app/api/assistant/route.ts`)

1. Verify the user session. Get their access token.
2. Open an MCP client: `StreamableHTTPClientTransport(new URL(MCP_URL), { requestInit: { headers: { Authorization: … } } })`.
3. `listTools()` → filter to the allowed list (no publish/schedule) → convert to OpenAI-style `tools` for Groq.
4. Loop: Groq chat completion → if `tool_calls`, run each via `client.callTool()` → append results → repeat. **Max 5 iterations.**
5. Return the final text + any draft ids created. The UI shows drafts with **Approve / Publish / Schedule** buttons (REST).

**Swap-in alternative:** call Claude's Messages API with `mcp_servers: [{ type: "url", url: MCP_URL, name: "linkedin", authorization_token }]`. Anthropic's cloud then calls our server directly and no MCP client code is needed. Check the current beta header in the MCP connector docs.

---

## 10. Build phases

Each phase ends with a "done when" check. Don't start the next phase until it passes.

### Phase 0: Setup (day 1)
- [ ] Create LinkedIn App A and App B. Link both to the TokenBurners Company Page. **Submit Community Management request for App B.**
- [ ] Supabase project. Get the connection string (see §11 on pooler vs direct).
- [ ] Monorepo scaffold, TS config, eslint/prettier, `CLAUDE.md`.
- [ ] Render web service (Starter) + `mcp.tokenburners.co.in` CNAME.
- **Done when:** `GET /health` returns 200 on the custom domain over HTTPS.

### Phase 1: LinkedIn core + DB — done (mocked LinkedIn credentials)
- [x] Drizzle schema + first migration.
- [x] `linkedin/http.ts`, `oauth.ts` (as `real.ts`/`mock.ts` behind a shared `LinkedInClient` interface), `posts.ts` (`createPost`), `images.ts` (image upload), `littleText.ts`.
- [x] REST: `/api/linkedin/connect` → LinkedIn consent → `/api/linkedin/callback` stores encrypted token + creates `authors` row.
- [x] `postService`: create draft, update, attach image, approve, publish, schedule.
- **Done when:** a post is published to a (mocked) profile via REST (curl) — verified locally against real Postgres with `LINKEDIN_MOCK=true`.
- **Still real-credential-gated:** actual publish to a real LinkedIn profile/page needs App A's real client id/secret (§7); swap `LINKEDIN_MOCK=false` once they exist. Image attach also needs an outbound-reachable image URL.

### Phase 2: MCP endpoint — done
- [x] `McpServer` with `list_authors`, `create_draft`, `update_draft`, `list_posts`, `attach_image`, plus `publish_post`/`schedule_post` (pulled forward from Phase 3/4 since MCP + the claude.ai connector are the current priority).
- [x] Streamable HTTP on `/mcp` (stateless: fresh server+transport per request).
- **Done when:** verified via curl JSON-RPC (`initialize`, `tools/list`, `tools/call`) — all 7 tools list with correct annotations, `create_draft` creates a row visible via REST.

### Phase 3: OAuth + claude.ai connector — server side done, connector registration pending
- [x] App auth (register/login, bcrypt, JWT) — `/api/auth/register`, `/api/auth/login`.
- [x] OAuth provider + `mcpAuthRouter`, login page (`/oauth/login`), `requireBearerAuth` on `/mcp`. Dynamic Client Registration, PKCE (S256), refresh token rotation all implemented and tested via curl.
- [x] `publish_post` with `confirm_text` check + `can_publish` check + audit log.
- [ ] Deploy publicly. Add as custom connector in claude.ai (Settings → Connectors) — needs a public HTTPS URL (Render + domain from Phase 0).
- **Done when:** from claude.ai you can draft a post, and publishing asks for confirmation and then succeeds. An unauthenticated `/mcp` call returns 401 — **verified locally**; claude.ai registration itself needs a public deployment.

### Phase 4: Web app + scheduling
- [ ] Next.js: login, connect-LinkedIn page, dashboard (drafts / scheduled / published / failed).
- [ ] Assistant route with Groq + MCP client (§9).
- [ ] `schedule_post` tool + scheduler job (polls every minute, `SELECT … FOR UPDATE SKIP LOCKED` so a post never double-publishes).
- [ ] Token-expiry banner.
- **Done when:** a teammate logs in, asks the assistant for a draft, edits it, schedules it, and it publishes on time.

### Phase 5: Company page features (after Community Management approval)
- [ ] Connect App B for the org. Author row for `urn:li:organization:…`.
- [ ] `get_post_stats`, `list_comments`, `reply_to_comment`. Stats view in dashboard.
- **Done when:** a post published as TokenBurners shows impressions/engagement in the app and in claude.ai.

### Phase 6: Hardening
- [ ] Rate limiting on `/oauth/*`, `/api/auth/*`, `/mcp`.
- [ ] Integration tests with a mocked LinkedIn API (no real posts in CI).
- [ ] Error alerts (failed scheduled posts → email via Zoho SMTP).
- [ ] Token revocation UI ("connected apps" list, revoke claude.ai access).

---

## 11. Gotchas

- **Supabase + Render networking:** Supabase direct connection hosts may resolve to IPv6 only. If Render can't reach it, use the Supabase **session pooler** connection string (port 5432 on the pooler host) as `DATABASE_URL`.
- **LinkedIn "little text" format:** post `commentary` treats some characters as reserved (e.g. `( ) [ ] { } < > @ | ~ _ * \`). Unescaped, they can break or truncate posts. Escape them in `littleText.ts` and unit-test it.
- **LinkedIn-Version rotation:** keep it in env and bump it every few months.
- **Community Management app must contain only that product.** Don't add Share on LinkedIn to App B.
- **Render free tier sleeps.** claude.ai and the scheduler will fail against a cold instance. Use the paid tier.
- **claude.ai custom connector availability and auth options depend on plan and change over time.** Check Anthropic's help center before Phase 3.
- **Prompt injection:** any tool that reads external text (comments in Phase 5) returns it as data. The publish gate (§6) is what protects you, so don't weaken it.
- **Never log** access tokens, auth codes, or LinkedIn responses containing tokens.

---

## 12. Environment variables

```
# server
NODE_ENV=
PORT=4000
PUBLIC_BASE_URL=https://mcp.tokenburners.co.in
DATABASE_URL=
JWT_SIGNING_KEY=
TOKEN_ENCRYPTION_KEY=            # 32 bytes, base64
LINKEDIN_VERSION=                # YYYYMM
LINKEDIN_SHARE_CLIENT_ID=
LINKEDIN_SHARE_CLIENT_SECRET=
LINKEDIN_COMMUNITY_CLIENT_ID=
LINKEDIN_COMMUNITY_CLIENT_SECRET=
ALLOWED_OAUTH_REDIRECTS=https://claude.ai/api/mcp/auth_callback
SMTP_HOST= SMTP_USER= SMTP_PASS=

# web
SERVER_URL=https://mcp.tokenburners.co.in
MCP_URL=https://mcp.tokenburners.co.in/mcp
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
```

---

## 13. Open decisions

1. **Multi-tenant or internal only?** If outside users will connect their own pages, that changes the LinkedIn review story, the data model (add `workspaces`), and pricing. Decide before Phase 4.
2. **Approval policy:** can any member publish as TokenBurners, or only admins? Default here: only `author_members.can_publish = true`.
3. **AI provider in app:** Groq (free tier, own MCP client) vs Claude API (`mcp_servers`, less code, paid). Plan assumes Groq.

---

## 14. Starter `CLAUDE.md` for the repo

```md
# Project conventions
- TypeScript strict, ESM, Node 20+.
- LinkedIn logic lives only in apps/server/src/linkedin (API calls) and services/ (rules).
  MCP tools and REST routes are thin wrappers that call services. Never call linkedin/ directly from them.
- All input validation with zod; MCP tool input schemas come from packages/shared.
- DB access only via Drizzle in services/. Migrations via drizzle-kit, never edit applied migrations.
- LinkedIn tokens: always encrypt with lib/crypto.ts before storing; never log them.
- Write tools must set destructiveHint: true. Nothing publishes to LinkedIn without an approved draft.
- Follow PLAN.md phases in order; each phase has a "done when" check.
```
