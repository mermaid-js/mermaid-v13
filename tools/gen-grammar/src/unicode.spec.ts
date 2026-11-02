import { describe, expect, it } from 'vitest';
import { packUnicodeLetters, unpackUnicodeLetters } from './unicode.ts';

// Built with escaped backslashes: the class must contain literal `\uXXXX` text, as flow.jison does.
const JISON = [
  '%%',
  '[\\u00C0-\\u00D6\\u00AA\\u00D8-\\u00F6]|',
  '[\\u00B5\\u00F7]',
  "                      return 'UNICODE_TEXT';",
].join('\n');

describe('packUnicodeLetters', () => {
  it('reads the UNICODE_TEXT class from flow.jison, sorts, merges adjacent ranges and packs base-36 deltas', () => {
    // Ranges: AA, B5, C0-D6, D8-F6 and F7 merged into D8-F7.
    // Deltas: aa-0=4q, 0; b5-aa=b, 0; c0-b5=b, d6-c0=m; d8-d6=2, f7-d8=v.
    expect(packUnicodeLetters(JISON)).toBe('4q 0 b 0 b m 2 v');
  });

  it('round-trips through unpack', () => {
    expect([...unpackUnicodeLetters('4q 0 b 0 b m 2 v')]).toEqual([
      0xaa, 0xaa, 0xb5, 0xb5, 0xc0, 0xd6, 0xd8, 0xf7,
    ]);
  });

  it('fails loudly when the class is missing', () => {
    expect(() => packUnicodeLetters('%%\n')).toThrow(/UNICODE_TEXT/);
  });
});
