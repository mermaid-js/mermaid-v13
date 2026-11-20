import { Kind, kindSet, TokenWriter } from '@mermaid-js/core/parser-kit';
import { describe, expect, it } from 'vitest';
import { excerpt, lineTokens } from './line-tokens.ts';

const WORD = 16;
const stream = (kinds: number[]) => {
  const w = new TokenWriter();
  kinds.forEach((k, i) => w.push(k, i, i + 1));
  return w.finish('x'.repeat(kinds.length));
};

describe('lineTokens', () => {
  const s = stream([WORD, Kind.Space, WORD, Kind.Newline, Kind.Comment, Kind.Newline, WORD]);

  it('drops trivia and line breaks, and marks the tokens that start a line', () => {
    const view = lineTokens(s);
    expect([...view.kind]).toEqual([WORD, WORD, WORD, Kind.EOF]);
    expect([...view.start]).toEqual([0, 2, 6, 7]);
    expect([...view.end]).toEqual([1, 3, 7, 7]);
    expect([...view.index]).toEqual([0, 2, 6, 7]);
    expect([...view.lineStart]).toEqual([1, 0, 1, 0]);
    expect(view.length).toBe(4);
  });

  it('keeps what `trivia` does not name', () => {
    const view = lineTokens(s, kindSet(Kind.Space));
    expect([...view.index]).toEqual([0, 2, 4, 6, 7]);
    expect([...view.lineStart]).toEqual([1, 0, 1, 1, 0]);
  });
});

describe('excerpt', () => {
  it('quotes the first line, at most 24 characters, with … when anything is cut', () => {
    expect(excerpt('short')).toBe('short');
    expect(excerpt('x'.repeat(24))).toBe('x'.repeat(24));
    expect(excerpt('x'.repeat(25))).toBe(`${'x'.repeat(24)}…`);
    expect(excerpt('one\ntwo')).toBe('one…');
    expect(excerpt('')).toBe('');
  });
});
