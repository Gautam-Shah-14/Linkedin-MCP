import { beforeAll, describe, expect, it } from 'vitest';

describe('LinkedIn connect state', () => {
  beforeAll(() => {
    process.env.JWT_SIGNING_KEY = 'test-signing-key';
    process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env';
  });

  it('round-trips a user id', async () => {
    const { signLinkedInState, verifyLinkedInState } = await import('../src/lib/jwt.js');
    expect(verifyLinkedInState(signLinkedInState('user-1'))).toBe('user-1');
  });

  it('rejects a tampered state and an access token', async () => {
    const { signLinkedInState, signAccessToken, verifyLinkedInState } = await import('../src/lib/jwt.js');
    expect(() => verifyLinkedInState(`${signLinkedInState('user-1')}x`)).toThrow();
    const access = signAccessToken({ sub: 'user-1', client_id: 'c', scope: 'mcp' }).token;
    expect(() => verifyLinkedInState(access)).toThrow();
  });
});
