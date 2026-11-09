import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { treemapCategories } from './generated/categories.ts';
import { treemapDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/treemap.ebnf` (D93, D94), for the language
 * facet (T6): every kind has a highlight category, and the keywords hover explains have docs.
 */
describe('generated treemap tables', () => {
  it('categorise keywords, numbers, strings, names and punctuation', () => {
    expect(treemapCategories[T.TreemapKeyword]).toBe('Keyword');
    expect(treemapCategories[T.ClassDef]).toBe('Keyword');
    expect(treemapCategories[T.Title]).toBe('Keyword');
    expect(treemapCategories[T.StyleSeparator]).toBe('Operator');
    expect(treemapCategories[T.Number]).toBe('Number');
    expect(treemapCategories[T.String]).toBe('String');
    expect(treemapCategories[T.Id]).toBe('Variable');
    expect(treemapCategories[T.Separator]).toBe('Punctuation');
  });

  it('document every keyword and operator kind', () => {
    expect(treemapDocs[T.TreemapKeyword]).toMatch(/starts a treemap/);
    expect(treemapDocs[T.ClassDef]).toMatch(/:::name/);
    for (const [key, kind] of Object.entries(T)) {
      const c = treemapCategories[kind];
      if (c === 'Keyword' || c === 'Operator') expect(treemapDocs[kind], key).toMatch(/\S/);
    }
  });
});
