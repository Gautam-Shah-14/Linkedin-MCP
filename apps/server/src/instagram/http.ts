import { env } from '../config/env.js';

export class InstagramApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'InstagramApiError';
  }
}

const GRAPH_BASE = 'https://graph.instagram.com';

export function graphUrl(path: string, query: Record<string, string> = {}): string {
  const base = `${GRAPH_BASE}/${env.INSTAGRAM_API_VERSION}/${path.replace(/^\//, '')}`;
  const qs = new URLSearchParams(query).toString();
  return qs ? `${base}?${qs}` : base;
}

/** Unversioned host paths (token exchange/refresh) use the bare graph host. */
export function graphUnversionedUrl(path: string, query: Record<string, string> = {}): string {
  const qs = new URLSearchParams(query).toString();
  return `${GRAPH_BASE}/${path.replace(/^\//, '')}${qs ? `?${qs}` : ''}`;
}

export async function instagramJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const message =
      (body as { error?: { message?: string } } | undefined)?.error?.message ??
      (body as { error_message?: string } | undefined)?.error_message ??
      `Instagram API error ${res.status}`;
    if (res.status === 401 || (body as { error?: { code?: number } } | undefined)?.error?.code === 190) {
      throw new InstagramApiError('Instagram connection expired, reconnect', res.status, body);
    }
    throw new InstagramApiError(message, res.status, body);
  }
  return body as T;
}
