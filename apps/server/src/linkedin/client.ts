export interface LinkedInUserInfo {
  sub: string;
  name: string;
  email?: string;
}

export interface CreatePostInput {
  authorUrn: string;
  commentary: string;
  imageUrn?: string;
  visibility?: 'PUBLIC' | 'CONNECTIONS';
}

export interface CreatePostResult {
  postUrn: string;
}

export interface InitializeImageUploadResult {
  uploadUrl: string;
  imageUrn: string;
}

export interface TokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
  scopes: string[];
}

/**
 * Contract for talking to LinkedIn. `services/` code depends only on this
 * interface, never on `real.ts` or `mock.ts` directly, so a mocked
 * credentials setup (LINKEDIN_MOCK=true) is a drop-in swap.
 */
export interface LinkedInClient {
  getUserInfo(accessToken: string): Promise<LinkedInUserInfo>;
  exchangeAuthorizationCode(code: string, redirectUri: string): Promise<TokenResult>;
  createPost(accessToken: string, input: CreatePostInput): Promise<CreatePostResult>;
  initializeImageUpload(
    accessToken: string,
    authorUrn: string,
  ): Promise<InitializeImageUploadResult>;
  uploadImageBytes(uploadUrl: string, bytes: Uint8Array, contentType: string): Promise<void>;
}
