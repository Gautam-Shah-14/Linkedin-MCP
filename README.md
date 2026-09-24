# TokenBurners LinkedIn MCP

A cloud-hosted server that exposes LinkedIn posting as [MCP](https://modelcontextprotocol.io) tools (plus plain REST), so both our own app and claude.ai (as a custom connector) can draft, review, and publish LinkedIn posts on behalf of the TokenBurners team.

See [`PLAN.md`](./PLAN.md) for the full architecture, data model, and phased build plan. See [`CLAUDE.md`](./CLAUDE.md) for repo conventions.

## Status

- **Phase 1 (LinkedIn core + DB):** done, verified against a real Postgres dev DB with a mocked LinkedIn client (`LINKEDIN_MOCK=true`). Swapping in real LinkedIn App credentials is the only thing left before it talks to the real LinkedIn API.
- **Phase 2 (MCP server):** done — all tools implemented and verified via JSON-RPC over the Streamable HTTP transport.
- **Phase 3 (OAuth + claude.ai connector):** server-side OAuth 2.1 (PKCE, Dynamic Client Registration, JWT access tokens) done and verified end to end via curl. Registering the server as a claude.ai custom connector still needs a public HTTPS deployment.
- **Phases 4–6** (web app, scheduling, company page analytics, hardening): not started.

## Repo layout

```
apps/
  server/   Express API: REST routes, MCP server (/mcp), OAuth provider (/oauth/*)
  web/      Next.js app (dashboard, connect flow, AI assistant) — scaffolded, not built out yet
packages/
  shared/   Zod schemas and types shared by server + web
```

See [`PLAN.md §4`](./PLAN.md#4-repo-structure-npm-workspaces-monorepo) for the detailed structure.

## Prerequisites

- Node.js 20+
- npm 10+
- A Postgres 16 database (local or Supabase)

## Setup

```bash
npm install
cp apps/server/.env.example apps/server/.env
```

Fill in `apps/server/.env`. For local development without real LinkedIn credentials, keep `LINKEDIN_MOCK=true` — the server will use a built-in mock LinkedIn client that returns realistic fake responses instead of calling the real API. You still need:

- `DATABASE_URL` — a Postgres connection string
- `JWT_SIGNING_KEY` — any random string (used to sign access tokens)
- `TOKEN_ENCRYPTION_KEY` — a base64-encoded 32-byte key, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

Run migrations and seed a dev user:

```bash
npm run db:migrate -w apps/server
npm run db:seed:dev-user -w apps/server
```

## Running

```bash
npm run dev:server   # Express API on http://localhost:4000
npm run dev:web      # Next.js app on http://localhost:3000
```

`GET /health` should return `200 {"status":"ok",...}`.

## Testing the MCP server locally

With the server running and `LINKEDIN_MOCK=true`, use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) or `curl` to exercise the OAuth + MCP flow:

1. `GET /.well-known/oauth-authorization-server` — discovery metadata
2. `POST /register` — Dynamic Client Registration
3. `GET /authorize?...` (with PKCE) → redirects to `/oauth/login`
4. Log in with the seeded dev user → redirects back with an authorization `code`
5. `POST /token` — exchange the code for an access token
6. `POST /mcp` with `Authorization: Bearer <token>` — JSON-RPC (`initialize`, `tools/list`, `tools/call`)

Unauthenticated requests to `/mcp` return `401` with a `WWW-Authenticate` header.

## Scripts

| Command | Does |
|---|---|
| `npm run dev:server` | Runs the Express server with hot reload |
| `npm run dev:web` | Runs the Next.js app |
| `npm run lint` | ESLint across the monorepo |
| `npm run typecheck` | TypeScript typecheck for server + web |
| `npm run build` | Builds shared, server, and web |
| `npm run db:generate -w apps/server` | Generates a Drizzle migration from schema changes |
| `npm run db:migrate -w apps/server` | Applies pending migrations |
| `npm test -w apps/server` | Runs server unit tests (vitest) |

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and PR to `main`: lint, typecheck, build, and server tests against a Postgres service container (with `LINKEDIN_MOCK=true`, so no real LinkedIn credentials are needed in CI).
