import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { journeyCategories } from './generated/categories.ts';
import { journeyDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/journey.ebnf` (D93, D94), for the language
 * facet (T6, #331): every kind has a highlight category, and the keywords hover explains have
 * docs.
 */
describe('generated journey tables', () => {
  it('categorise keywords, names and values', () => {
    expect(journeyCategories[T.Journey]).toBe('Keyword');
    expect(journeyCategories[T.Section]).toBe('Keyword');
    expect(journeyCategories[T.TaskName]).toBe('Variable');
    expect(journeyCategories[T.TaskData]).toBe('String');
    expect(journeyCategories[T.AccTitleValue]).toBe('String');
  });

  it('document every keyword kind', () => {
    expect(journeyDocs[T.Journey]).toMatch(/journey/);
    expect(journeyDocs[T.Section]).toMatch(/section/);
    for (const [key, kind] of Object.entries(T)) {
      const c = journeyCategories[kind];
      if ((c === 'Keyword' || c === 'Operator') && journeyDocs[kind] === undefined) {
        // `accDescr {` and its `}` have no terminal of their own (jison returns none).
        expect(['AccDescrMultiline', 'AccDescrMultilineEnd'], key).toContain(key);
      }
    }
  });
});
