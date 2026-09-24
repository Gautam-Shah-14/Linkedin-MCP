import { describe, expect, it } from 'vitest';

import { escapeLittleText } from '../src/linkedin/littleText.js';

describe('escapeLittleText', () => {
  it('escapes LinkedIn little-text reserved characters', () => {
    expect(escapeLittleText('Hello (world) [test] {a} <b> @c | ~d * e \\ f')).toBe(
      'Hello \\(world\\) \\[test\\] \\{a\\} \\<b\\> \\@c \\| \\~d \\* e \\\\ f',
    );
  });

  it('leaves ordinary text untouched', () => {
    const text = 'Excited to launch our new integration today!';
    expect(escapeLittleText(text)).toBe(text);
  });
});
