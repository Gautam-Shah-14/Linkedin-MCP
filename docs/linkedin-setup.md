# LinkedIn app setup

Two LinkedIn developer apps are needed (see PLAN.md §7). Start with App A: it is self-serve and needs no review. App B needs LinkedIn approval, so apply early.

| App | Products | Scopes | Lets the server |
|-----|----------|--------|-----------------|
| A: "TokenBurners Share" | Sign In with LinkedIn using OpenID Connect, Share on LinkedIn | `openid profile email w_member_social` | Post as a person |
| B: "TokenBurners Community" | Community Management API (must be the only product on the app) | `w_organization_social r_organization_social rw_organization_admin` | Post as, and read data for, a company page |

## Before you start
- A LinkedIn account that is an admin of the company page.
- The page's public URL and a verified page (App B requires it).
- A redirect URL the server is reachable at. For a first local test use `http://localhost:4000/api/linkedin/callback`. For Render use `https://<your-domain>/api/linkedin/callback`. It must match `PUBLIC_BASE_URL` + `/api/linkedin/callback` exactly.

## App A: post as yourself
1. Go to https://www.linkedin.com/developers/apps and choose **Create app**.
2. Name it, pick the company page to associate with it, upload a logo, accept the terms.
3. On the **Products** tab, request **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**. Both are approved immediately.
4. On the **Auth** tab, add the redirect URL above under **Authorized redirect URLs for your app**.
5. On the **Auth** tab, copy the **Client ID** and **Primary Client Secret**.
6. Put them in `apps/server/.env` (never commit this file):
   ```
   LINKEDIN_MOCK=false
   LINKEDIN_SHARE_CLIENT_ID=...
   LINKEDIN_SHARE_CLIENT_SECRET=...
   ```
   On Render, set the same names as environment variables instead.
7. Restart the server and start the connect flow at `/api/linkedin/connect`.
   Today that route is guarded by the dev-only `X-User-Id` header, which a browser does not send. Until the real app login lands, send the header with a tool that can (for example a browser extension that sets request headers), or open the URL the route would redirect to by hand with `state=<your user id>`.
8. Approve on LinkedIn's consent screen. The callback stores the encrypted token and creates an author row for your profile.
9. Create a draft, approve it (`POST /api/posts/:id/approve`), then publish it (REST or the `publish_post` tool).

Access tokens last about 60 days and App A may not issue refresh tokens, so plan to reconnect.

## App B: company page posts and data
1. Create a second app, again associated with the company page.
2. Request **Community Management API** as the only product. Do not add Share on LinkedIn to this app.
3. Fill in the review form: legal entity details, a description of the use case (managing the company's own page content and reading its analytics), and the verified company page. Review can take days to weeks.
4. After approval, add the same redirect URL on the **Auth** tab and copy the credentials:
   ```
   LINKEDIN_COMMUNITY_CLIENT_ID=...
   LINKEDIN_COMMUNITY_CLIENT_SECRET=...
   ```
5. Connecting App B for the organization and the analytics/comments tools are Phase 5 work in PLAN.md; they are not built yet.

## Security
- Never paste client secrets into chat, issues or commits. Use `.env` locally and Render environment variables in production.
- Rotate the secret from the **Auth** tab if it is ever exposed.
- Stored LinkedIn tokens are encrypted with `TOKEN_ENCRYPTION_KEY`. Keep that key stable, or stored tokens become unreadable.
