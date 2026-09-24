import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const API_BASE = 'https://api.linkedin.com';

export class LinkedInApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'LinkedInApiError';
  }
}

export interface LinkedInRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  accessToken: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Set when the caller expects the LinkedIn id from the x-restli-id response header. */
  expectRestliId?: boolean;
}

export interface LinkedInResponse<T> {
  data: T;
  restliId?: string;
}

const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Thin wrapper over LinkedIn's REST API. No business rules here.
 * When LINKEDIN_MOCK=true, callers should use the mock client in ./mock.ts
 * instead — this function always hits the real API.
 */
export async function linkedInRequest<T>({
  method = 'GET',
  path,
  accessToken,
  body,
  headers,
  expectRestliId,
}: LinkedInRequestOptions): Promise<LinkedInResponse<T>> {
  if (!env.LINKEDIN_VERSION) {
    throw new Error('LINKEDIN_VERSION is not set');
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'LinkedIn-Version': env.LINKEDIN_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const backoffMs = 2 ** attempt * 500;
      logger.warn({ path, attempt, backoffMs }, 'linkedin rate limited, retrying');
      await sleep(backoffMs);
      continue;
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => undefined);
      if (res.status === 401) {
        throw new LinkedInApiError('LinkedIn connection expired, reconnect', 401, errBody);
      }
      throw new LinkedInApiError(`LinkedIn API error ${res.status}`, res.status, errBody);
    }

    const restliId = expectRestliId ? (res.headers.get('x-restli-id') ?? undefined) : undefined;
    const data = res.status === 204 ? (undefined as T) : ((await res.json()) as T);
    return { data, restliId };
  }

  throw new LinkedInApiError('LinkedIn API rate limited after retries', 429);
}
