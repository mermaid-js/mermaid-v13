import { describe, expect, it } from 'vitest';
import { code, span, tokenBefore } from './facet.ts';
import type { TokenStream } from './tokens.ts';

const stream = (starts: number[]): TokenStream =>
  ({ length: starts.length, start: Uint32Array.from(starts) }) as unknown as TokenStream;

describe('facet helpers', () => {
  it('span is a range', () => {
    expect(span(1, 3)).toEqual({ start: 1, end: 3 });
  });

  it('code fences text past its longest backtick run', () => {
    expect(code('a')).toBe('`a`');
    expect(code('a`b')).toBe('``a`b``');
    expect(code('`a')).toBe('`` `a ``');
    expect(code('')).toBe('`  `');
  });

  it('tokenBefore finds the last token starting at or before an offset', () => {
    const t = stream([0, 4, 9]);
    expect(tokenBefore(t, 0)).toBe(0);
    expect(tokenBefore(t, 5)).toBe(1);
    expect(tokenBefore(t, 9)).toBe(2);
    expect(tokenBefore(stream([2]), 1)).toBe(-1);
  });
});
