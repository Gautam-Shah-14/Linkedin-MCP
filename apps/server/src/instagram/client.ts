export interface InstagramProfile {
  userId: string;
  username: string;
}

export interface InstagramTokenResult {
  accessToken: string;
  userId?: string;
  scopes: string[];
  expiresInSeconds?: number;
}

export type InstagramContainerStatus = 'IN_PROGRESS' | 'FINISHED' | 'ERROR' | 'EXPIRED' | 'PUBLISHED';

/**
 * Contract for talking to Instagram (Instagram API with Instagram Login — no
 * Facebook Page needed). `services/` code depends only on this interface, so
 * INSTAGRAM_MOCK=true is a drop-in swap.
 */
export interface InstagramClient {
  buildAuthorizeUrl(redirectUri: string, state: string): string;
  /** Exchanges the authorization code for a short-lived token. */
  exchangeAuthorizationCode(code: string, redirectUri: string): Promise<InstagramTokenResult>;
  /** Exchanges a short-lived token for a long-lived (about 60 day) token. */
  exchangeForLongLivedToken(shortLivedToken: string): Promise<InstagramTokenResult>;
  refreshLongLivedToken(accessToken: string): Promise<InstagramTokenResult>;
  getProfile(accessToken: string): Promise<InstagramProfile>;
  createImageContainer(
    accessToken: string,
    igUserId: string,
    input: { imageUrl: string; caption: string },
  ): Promise<{ containerId: string }>;
  getContainerStatus(accessToken: string, containerId: string): Promise<InstagramContainerStatus>;
  publishContainer(
    accessToken: string,
    igUserId: string,
    containerId: string,
  ): Promise<{ mediaId: string }>;
}
