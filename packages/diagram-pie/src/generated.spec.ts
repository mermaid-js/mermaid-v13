import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { pieCategories } from './generated/categories.ts';
import { pieDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/pie.ebnf` (D93, D94), for the language
 * facet (T6): every kind has a highlight category, and the keywords hover explains have docs.
 */
describe('generated pie tables', () => {
  it('categorise keywords, numbers, strings and punctuation', () => {
    expect(pieCategories[T.Pie]).toBe('Keyword');
    expect(pieCategories[T.ShowData]).toBe('Keyword');
    expect(pieCategories[T.Title]).toBe('Keyword');
    expect(pieCategories[T.Number]).toBe('Number');
    expect(pieCategories[T.String]).toBe('String');
    expect(pieCategories[T.Colon]).toBe('Punctuation');
  });

  it('document every keyword kind', () => {
    expect(pieDocs[T.Pie]).toMatch(/pie chart/);
    expect(pieDocs[T.ShowData]).toMatch(/legend/);
    for (const [key, kind] of Object.entries(T)) {
      const c = pieCategories[kind];
      if (c === 'Keyword' || c === 'Operator') expect(pieDocs[kind], key).toMatch(/\S/);
    }
  });
});
