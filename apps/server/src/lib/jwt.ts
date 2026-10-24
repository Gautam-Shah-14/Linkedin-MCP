import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';

export interface AccessTokenClaims {
  sub: string; // user id
  client_id: string;
  scope: string;
}

function getSigningKey(): string {
  if (!env.JWT_SIGNING_KEY) {
    throw new Error('JWT_SIGNING_KEY is not set');
  }
  return env.JWT_SIGNING_KEY;
}

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1h, per §8

export function signAccessToken(claims: AccessTokenClaims): { token: string; expiresIn: number } {
  const token = jwt.sign(claims, getSigningKey(), { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export function verifyAccessToken(token: string): AccessTokenClaims & { exp: number } {
  return jwt.verify(token, getSigningKey()) as AccessTokenClaims & { exp: number };
}

const LINKEDIN_STATE_TTL_SECONDS = 10 * 60;

/** Signed OAuth `state` for the LinkedIn connect flow, so the callback can't be pointed at an arbitrary user id. */
export function signLinkedInState(userId: string): string {
  return jwt.sign({ sub: userId, purpose: 'linkedin_connect' }, getSigningKey(), {
    expiresIn: LINKEDIN_STATE_TTL_SECONDS,
  });
}

export function verifyLinkedInState(state: string): string {
  const claims = jwt.verify(state, getSigningKey()) as { sub?: string; purpose?: string };
  if (claims.purpose !== 'linkedin_connect' || !claims.sub) {
    throw new Error('Invalid state');
  }
  return claims.sub;
}
