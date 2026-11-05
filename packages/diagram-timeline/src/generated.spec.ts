import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { timelineCategories } from './generated/categories.ts';
import { timelineDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/timeline.ebnf` (D93, D94), for the language
 * facet (T6, #318): every kind has a highlight category, and the keywords hover explains have
 * docs.
 */
describe('generated timeline tables', () => {
  it('categorise keywords, periods and texts', () => {
    expect(timelineCategories[T.Timeline]).toBe('Keyword');
    expect(timelineCategories[T.TimelineTD]).toBe('Keyword');
    expect(timelineCategories[T.Section]).toBe('Keyword');
    expect(timelineCategories[T.Period]).toBe('Variable');
    expect(timelineCategories[T.Event]).toBe('String');
    expect(timelineCategories[T.AccDescrMultilineValue]).toBe('String');
  });

  it('document every keyword kind', () => {
    expect(timelineDocs[T.Timeline]).toMatch(/`timeline TD`/);
    expect(timelineDocs[T.Section]).toMatch(/section/);
    for (const [key, kind] of Object.entries(T)) {
      if (timelineCategories[kind] === 'Keyword' && timelineDocs[kind] === undefined) {
        // `accDescr {` and its `}` have no terminal of their own (jison returns none).
        expect(['AccDescrMultiline', 'AccDescrMultilineEnd'], key).toContain(key);
      }
    }
  });
});
