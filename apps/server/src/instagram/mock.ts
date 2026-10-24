import { randomUUID } from 'node:crypto';

import { logger } from '../lib/logger.js';
import type { InstagramClient } from './client.js';

/** Stand-in for Instagram while no real app credentials exist (INSTAGRAM_MOCK=true). */
export const mockInstagramClient: InstagramClient = {
  buildAuthorizeUrl(redirectUri, state) {
    // Skip the consent screen and go straight to our callback.
    return `${redirectUri}?${new URLSearchParams({ code: 'mock-code', state }).toString()}`;
  },

  async exchangeAuthorizationCode() {
    return {
      accessToken: `mock-ig-short-${randomUUID()}`,
      userId: 'mock-ig-user-1',
      scopes: ['instagram_business_basic', 'instagram_business_content_publish'],
    };
  },

  async exchangeForLongLivedToken() {
    return {
      accessToken: `mock-ig-long-${randomUUID()}`,
      scopes: ['instagram_business_basic', 'instagram_business_content_publish'],
      expiresInSeconds: 60 * 60 * 24 * 60,
    };
  },

  async refreshLongLivedToken() {
    return {
      accessToken: `mock-ig-long-${randomUUID()}`,
      scopes: [],
      expiresInSeconds: 60 * 60 * 24 * 60,
    };
  },

  async getProfile() {
    return { userId: 'mock-ig-user-1', username: 'mock_instagram_user' };
  },

  async createImageContainer(_token, igUserId, input) {
    const containerId = `mock-container-${randomUUID()}`;
    logger.debug({ igUserId, containerId, imageUrl: input.imageUrl }, 'mock instagram: createImageContainer');
    return { containerId };
  },

  async getContainerStatus() {
    return 'FINISHED';
  },

  async publishContainer(_token, igUserId, containerId) {
    const mediaId = `mock-media-${randomUUID()}`;
    logger.debug({ igUserId, containerId, mediaId }, 'mock instagram: publishContainer');
    return { mediaId };
  },
};
