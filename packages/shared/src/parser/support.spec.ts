import { sourceView } from '@mermaid-js/core/parser-kit';
import { describe, expect, it } from 'vitest';
import { holesIn } from './support.ts';

describe('holesIn', () => {
  // Three directives, removed: 2–9, 11–19 and 21–28.
  const src = 'ab%%{x}%%cd%%{yy}%%ef%%{z}%%gh';
  const view = sourceView(src, 0, [
    { start: 2, end: 9 },
    { start: 11, end: 19 },
    { start: 21, end: 28 },
  ]);

  it('returns the removed spans that overlap the range, in source order', () => {
    expect(holesIn(view, { start: 5, end: 12 })).toMatchObject([
      { start: 2, end: 9 },
      { start: 11, end: 19 },
    ]);
  });

  it('leaves out a span that only touches an end of the range', () => {
    expect(holesIn(view, { start: 9, end: 11 })).toEqual([]);
    expect(holesIn(view, { start: 19, end: 21 })).toEqual([]);
  });

  it('returns nothing for a view without removed spans', () => {
    expect(holesIn(sourceView('abc', 0, []), { start: 0, end: 3 })).toEqual([]);
  });
});
