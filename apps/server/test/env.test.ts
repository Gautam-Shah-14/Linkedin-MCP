import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadMock(value: string | undefined) {
  vi.resetModules();
  process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env'; // keep a local .env out of the test
  if (value === undefined) delete process.env.LINKEDIN_MOCK;
  else process.env.LINKEDIN_MOCK = value;
  const { env } = await import('../src/config/env.js');
  return env.LINKEDIN_MOCK;
}

describe('LINKEDIN_MOCK', () => {
  afterEach(() => {
    delete process.env.LINKEDIN_MOCK;
  });

  it('defaults to false', async () => {
    expect(await loadMock(undefined)).toBe(false);
  });

  it('treats "false" as false', async () => {
    expect(await loadMock('false')).toBe(false);
  });

  it('treats "true" as true', async () => {
    expect(await loadMock('true')).toBe(true);
  });
});
