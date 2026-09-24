import { randomUUID } from 'node:crypto';

import { logger } from '../lib/logger.js';
import type {
  CreatePostInput,
  CreatePostResult,
  InitializeImageUploadResult,
  LinkedInClient,
  LinkedInUserInfo,
  TokenResult,
} from './client.js';

/**
 * Stand-in for LinkedIn while no real developer app credentials exist yet.
 * Enabled via LINKEDIN_MOCK=true. Returns deterministic-shaped fake data so
 * services/, MCP tools, and REST routes can be built and tested end to end.
 */
export const mockLinkedInClient: LinkedInClient = {
  async getUserInfo(_accessToken): Promise<LinkedInUserInfo> {
    logger.debug('mock linkedin: getUserInfo');
    return {
      sub: 'mock-member-1',
      name: 'Mock User',
      email: 'mock-user@example.com',
    };
  },

  async exchangeAuthorizationCode(code, _redirectUri): Promise<TokenResult> {
    logger.debug({ code }, 'mock linkedin: exchangeAuthorizationCode');
    return {
      accessToken: `mock-access-${randomUUID()}`,
      refreshToken: `mock-refresh-${randomUUID()}`,
      expiresInSeconds: 60 * 60 * 24 * 60,
      scopes: ['openid', 'profile', 'email', 'w_member_social'],
    };
  },

  async createPost(_accessToken, input: CreatePostInput): Promise<CreatePostResult> {
    const postUrn = `urn:li:share:mock-${randomUUID()}`;
    logger.debug({ input, postUrn }, 'mock linkedin: createPost');
    return { postUrn };
  },

  async initializeImageUpload(
    _accessToken,
    authorUrn,
  ): Promise<InitializeImageUploadResult> {
    const imageUrn = `urn:li:image:mock-${randomUUID()}`;
    logger.debug({ authorUrn, imageUrn }, 'mock linkedin: initializeImageUpload');
    return {
      uploadUrl: `https://mock-linkedin.invalid/upload/${randomUUID()}`,
      imageUrn,
    };
  },

  async uploadImageBytes(uploadUrl, bytes): Promise<void> {
    logger.debug({ uploadUrl, byteLength: bytes.byteLength }, 'mock linkedin: uploadImageBytes');
  },
};
