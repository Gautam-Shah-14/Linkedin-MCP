# Project conventions

- TypeScript strict, ESM, Node 20+.
- LinkedIn logic lives only in apps/server/src/linkedin (API calls) and services/ (rules).
  MCP tools and REST routes are thin wrappers that call services. Never call linkedin/ directly from them.
- All input validation with zod; MCP tool input schemas come from packages/shared.
- DB access only via Drizzle in services/. Migrations via drizzle-kit, never edit applied migrations.
- LinkedIn tokens: always encrypt with lib/crypto.ts before storing; never log them.
- Write tools must set destructiveHint: true. Nothing publishes to LinkedIn without an approved draft.
- Follow PLAN.md phases in order; each phase has a "done when" check.
