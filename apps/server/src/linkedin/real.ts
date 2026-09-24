import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import type {
  CreatePostInput,
  CreatePostResult,
  InitializeImageUploadResult,
  LinkedInClient,
  LinkedInUserInfo,
  TokenResult,
} from './client.js';
import { escapeLittleText } from './littleText.js';
import { linkedInRequest } from './http.js';

const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

export const realLinkedInClient: LinkedInClient = {
  async getUserInfo(accessToken): Promise<LinkedInUserInfo> {
    const res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`LinkedIn userinfo failed: ${res.status}`);
    }
    const body = (await res.json()) as { sub: string; name: string; email?: string };
    return { sub: body.sub, name: body.name, email: body.email };
  },

  async exchangeAuthorizationCode(code, redirectUri): Promise<TokenResult> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: env.LINKEDIN_SHARE_CLIENT_ID ?? '',
      client_secret: env.LINKEDIN_SHARE_CLIENT_SECRET ?? '',
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) {
      logger.error({ status: res.status }, 'linkedin token exchange failed');
      throw new Error(`LinkedIn token exchange failed: ${res.status}`);
    }
    const body = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresInSeconds: body.expires_in,
      scopes: body.scope.split(','),
    };
  },

  async createPost(accessToken, input: CreatePostInput): Promise<CreatePostResult> {
    const { restliId } = await linkedInRequest({
      method: 'POST',
      path: '/rest/posts',
      accessToken,
      expectRestliId: true,
      body: {
        author: input.authorUrn,
        commentary: escapeLittleText(input.commentary),
        visibility: input.visibility ?? 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
        ...(input.imageUrn
          ? { content: { media: { id: input.imageUrn } } }
          : {}),
      },
    });
    if (!restliId) {
      throw new Error('LinkedIn did not return x-restli-id for created post');
    }
    return { postUrn: restliId };
  },

  async initializeImageUpload(accessToken, authorUrn): Promise<InitializeImageUploadResult> {
    const { data } = await linkedInRequest<{
      value: { uploadUrl: string; image: string };
    }>({
      method: 'POST',
      path: '/rest/images?action=initializeUpload',
      accessToken,
      body: { initializeUploadRequest: { owner: authorUrn } },
    });
    return { uploadUrl: data.value.uploadUrl, imageUrn: data.value.image };
  },

  async uploadImageBytes(uploadUrl, bytes, contentType): Promise<void> {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: bytes as BodyInit,
    });
    if (!res.ok) {
      throw new Error(`LinkedIn image upload failed: ${res.status}`);
    }
  },
};
