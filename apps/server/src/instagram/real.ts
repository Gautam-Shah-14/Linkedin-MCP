import { env } from '../config/env.js';
import type { InstagramClient, InstagramContainerStatus, InstagramTokenResult } from './client.js';
import { graphUnversionedUrl, graphUrl, instagramJson } from './http.js';

const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const SHORT_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];

interface TokenBody {
  access_token: string;
  user_id?: string | number;
  permissions?: string;
  expires_in?: number;
}

function toTokenResult(body: TokenBody): InstagramTokenResult {
  return {
    accessToken: body.access_token,
    userId: body.user_id === undefined ? undefined : String(body.user_id),
    scopes: body.permissions ? body.permissions.split(',') : SCOPES,
    expiresInSeconds: body.expires_in,
  };
}

export const realInstagramClient: InstagramClient = {
  buildAuthorizeUrl(redirectUri, state) {
    const params = new URLSearchParams({
      client_id: env.INSTAGRAM_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(','),
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  },

  async exchangeAuthorizationCode(code, redirectUri) {
    const body = await instagramJson<TokenBody | { data: TokenBody[] }>(SHORT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.INSTAGRAM_CLIENT_ID ?? '',
        client_secret: env.INSTAGRAM_CLIENT_SECRET ?? '',
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        // Instagram appends "#_" to the code in the redirect.
        code: code.replace(/#_$/, ''),
      }).toString(),
    });
    // Meta's docs show the response wrapped in { data: [...] }; accept both shapes.
    const token = 'data' in body ? body.data[0] : body;
    if (!token) {
      throw new Error('Instagram token exchange returned no token');
    }
    return toTokenResult(token);
  },

  async exchangeForLongLivedToken(shortLivedToken) {
    const body = await instagramJson<TokenBody>(
      graphUnversionedUrl('access_token', {
        grant_type: 'ig_exchange_token',
        client_secret: env.INSTAGRAM_CLIENT_SECRET ?? '',
        access_token: shortLivedToken,
      }),
    );
    return toTokenResult(body);
  },

  async refreshLongLivedToken(accessToken) {
    const body = await instagramJson<TokenBody>(
      graphUnversionedUrl('refresh_access_token', {
        grant_type: 'ig_refresh_token',
        access_token: accessToken,
      }),
    );
    return toTokenResult(body);
  },

  async getProfile(accessToken) {
    const body = await instagramJson<{ user_id?: string; id?: string; username: string }>(
      graphUrl('me', { fields: 'user_id,username', access_token: accessToken }),
    );
    const userId = body.user_id ?? body.id;
    if (!userId) {
      throw new Error('Instagram profile response had no user id');
    }
    return { userId: String(userId), username: body.username };
  },

  async createImageContainer(accessToken, igUserId, input) {
    const body = await instagramJson<{ id: string }>(graphUrl(`${igUserId}/media`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        image_url: input.imageUrl,
        caption: input.caption,
        access_token: accessToken,
      }).toString(),
    });
    return { containerId: body.id };
  },

  async getContainerStatus(accessToken, containerId) {
    const body = await instagramJson<{ status_code: InstagramContainerStatus }>(
      graphUrl(containerId, { fields: 'status_code', access_token: accessToken }),
    );
    return body.status_code;
  },

  async publishContainer(accessToken, igUserId, containerId) {
    const body = await instagramJson<{ id: string }>(graphUrl(`${igUserId}/media_publish`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ creation_id: containerId, access_token: accessToken }).toString(),
    });
    return { mediaId: body.id };
  },
};
