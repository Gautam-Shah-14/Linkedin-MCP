# Instagram setup

The server posts to Instagram through the **Instagram API with Instagram Login**. It needs no Facebook Page, only an Instagram **professional** account (Business or Creator).

## What is built
- Connect an account: open `/instagram/connect`, sign in, approve on Instagram.
- Tokens are stored encrypted, last about 60 days, and are refreshed automatically when within 7 days of expiry.
- Posts: one JPEG image plus a caption (max 2,200 characters). The image must be a public `https` URL, because Instagram fetches it itself.
- Nothing publishes without approval: draft, then a human approves it (`POST /api/instagram/posts/:id/approve`), then publish with `confirmText` equal to the first 30 characters of the caption. Editing an approved post sends it back to draft.
- MCP tools: `instagram_list_accounts`, `instagram_create_draft`, `instagram_update_draft`, `instagram_list_posts`, `instagram_publish_post`. There is deliberately no approve tool.
- Not built yet: reels, stories, carousels, scheduling, comments.

## Meta app setup (you)
1. Go to https://developers.facebook.com/apps and create an app (use the "Business" type, or whichever type offers the Instagram product).
2. Add the **Instagram** product and choose **API setup with Instagram login**.
3. In the Instagram settings copy the **Instagram app ID** and **Instagram app secret** (these differ from the Facebook app id and secret).
4. Under **Business login settings**, add the OAuth redirect URI. Meta requires https for most apps; check whether `http://localhost` is accepted for development. Use `PUBLIC_BASE_URL` + `/api/instagram/callback`.
5. Add your Instagram professional account as an **Instagram tester** on the app and accept the invite from the Instagram app (Settings, Website permissions, Tester invites). In development mode only testers can authorize.
6. Posting for accounts you do not own needs Meta **App Review** for `instagram_business_content_publish`. For your own account, development mode is enough.

## Environment variables
```
INSTAGRAM_MOCK=false
INSTAGRAM_CLIENT_ID=...
INSTAGRAM_CLIENT_SECRET=...
INSTAGRAM_API_VERSION=v26.0
```
Keep the secret out of chat and out of git; use `.env` locally and environment variables on Render.

## Database
Migration `0002` adds `instagram_accounts` and `instagram_posts`. It is additive. Run `npx drizzle-kit migrate` from `apps/server` on a machine that can reach the database.

## Limits to remember
- JPEG only. Meta documents 100 API-published posts per 24 hours (a carousel counts as one), though the carousel section of the docs says 50.
- If the account is linked to a Facebook Page that requires Page Publishing Authorization, publishing is blocked until that is completed.
- The real client was written from Meta's docs and has not been run against Instagram yet; only the mock path is tested.
