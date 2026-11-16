import { describe, expect, it } from 'vitest';
import type { ProbeResult, TokenStream } from '@mermaid-js/core/parser-kit';
import {
  classDefHover,
  code,
  covers,
  insertWithSeparator,
  span,
  statementAt,
  statementOverlapping,
  statementTokens,
  tokenBefore,
  wordRange,
} from './facet.ts';

const stream = (starts: number[]): TokenStream =>
  ({ length: starts.length, start: Uint32Array.from(starts) }) as unknown as TokenStream;

/** Tokens as `[kind, start, end]`. */
const tokens = (list: readonly (readonly [number, number, number])[]): TokenStream =>
  ({
    length: list.length,
    kind: Uint16Array.from(list.map(([k]) => k)),
    start: Uint32Array.from(list.map(([, s]) => s)),
    end: Uint32Array.from(list.map(([, , e]) => e)),
  }) as unknown as TokenStream;

const probe = (offset: number, prefixStart: number): ProbeResult => ({
  offset,
  expected: [],
  mode: 'INITIAL',
  prefix: { start: prefixStart, end: offset },
});

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

  it('statementAt finds the statement holding an offset, its ends included', () => {
    const list = [{ range: span(0, 3) }, { range: span(5, 9) }];
    expect(statementAt(list, 0)).toBe(list[0]);
    expect(statementAt(list, 3)).toBe(list[0]);
    expect(statementAt(list, 4)).toBeUndefined();
    expect(statementAt(list, 9)).toBe(list[1]);
    expect(statementAt([], 1)).toBeUndefined();
  });

  it('statementOverlapping finds the statement the bisection meets first', () => {
    const list = [{ range: span(0, 3) }, { range: span(5, 9) }, { range: span(12, 14) }];
    expect(statementOverlapping(list, 0)).toBe(list[0]);
    expect(statementOverlapping(list, 4)).toBeUndefined();
    expect(statementOverlapping(list, 14)).toBe(list[2]);
    expect(statementOverlapping([], 1)).toBeUndefined();
    // Touching ranges: the middle of the bisection wins, where statementAt takes the later one.
    const touching = [{ range: span(0, 5) }, { range: span(5, 9) }, { range: span(9, 12) }];
    expect(statementOverlapping(touching, 5)).toBe(touching[1]);
    expect(statementOverlapping(touching, 9)).toBe(touching[1]);
    expect(statementAt(touching, 9)).toBe(touching[2]);
  });

  it('covers a non-empty range holding the offset', () => {
    expect(covers(4, span(2, 4))).toBe(true);
    expect(covers(5, span(2, 4))).toBe(false);
    expect(covers(2, span(2, 2))).toBe(false);
  });

  it('statementTokens lists the statement before the cursor, first to last', () => {
    // `a b\nc d|e`: 1 = word, 2 = line break, 3 = comment.
    const t = tokens([
      [1, 0, 1],
      [1, 2, 3],
      [2, 3, 4],
      [1, 4, 5],
      [3, 5, 6],
      [1, 6, 9],
    ]);
    const ends = new Set([2]);
    expect(statementTokens(t, 7, ends, (k) => k === 3)).toEqual([3]);
    expect(statementTokens(t, 9, ends, () => false)).toEqual([3, 4, 5]);
    expect(statementTokens(t, 3, ends, () => false)).toEqual([0, 1]);
  });

  it('wordRange stops the word by the kind of the token the cursor is in', () => {
    const text = 'ab cd(x)';
    const t = tokens([
      [1, 0, 5],
      [2, 5, 8],
    ]);
    const stop = (kind: number) => (kind === 2 ? undefined : /\s/);
    expect(wordRange(text, t, probe(1, 0), stop)).toEqual(span(0, 2));
    expect(wordRange(text, t, probe(6, 5), stop)).toEqual(span(5, 8));
    expect(wordRange(text, t, probe(1, 0), /\s/)).toEqual(span(0, 2));
  });

  it('classDefHover shows a class with its classDef and its users', () => {
    expect(classDefHover('class', 'hot', ['fill:red', 'stroke:0'], 'Used by 2 nodes')).toBe(
      '**class** `hot`\n\n`classDef hot fill:red,stroke:0`\n\nUsed by 2 nodes'
    );
    expect(classDefHover('style class', 'a', [], 'x')).toBe(
      '**style class** `a`\n\nIts `classDef` sets no styles.\n\nx'
    );
    expect(classDefHover('class', 'a', undefined, 'x')).toBe(
      '**class** `a`\n\nNo `classDef` defines it.\n\nx'
    );
  });

  it('insertWithSeparator adds the separator only where the text after lacks one', () => {
    const opens = /^[\t ]*[:{]/;
    expect(insertWithSeparator('title', ' ', '', opens)).toBe('title ');
    expect(insertWithSeparator('accTitle', ': ', ' x', opens)).toBe('accTitle:');
    expect(insertWithSeparator('accTitle', ': ', ' : x', opens)).toBe('accTitle');
    expect(insertWithSeparator('end', undefined, '', opens)).toBe('end');
  });
});
