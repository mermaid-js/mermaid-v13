import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { mindmapCategories } from './generated/categories.ts';
import { mindmapDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/mindmap.ebnf` (D93, D94), for the language
 * facet (T6, #389): every kind has a highlight category, and the keywords and operators hover
 * explains have docs.
 */
describe('generated mindmap tables', () => {
  it('categorise the keyword, ids, texts and shape delimiters', () => {
    expect(mindmapCategories[T.Mindmap]).toBe('Keyword');
    expect(mindmapCategories[T.NodeId]).toBe('Variable');
    expect(mindmapCategories[T.NodeDescr]).toBe('String');
    expect(mindmapCategories[T.NodeDStart]).toBe('Punctuation');
    expect(mindmapCategories[T.Class]).toBe('Variable');
    expect(mindmapCategories[T.SpaceLine]).toBe('Comment');
  });

  it('document every keyword and operator kind', () => {
    expect(mindmapDocs[T.Mindmap]).toMatch(/`mindmap`/);
    expect(mindmapDocs[T.IconStart]).toMatch(/::icon/);
    expect(mindmapDocs[T.ClassStart]).toMatch(/:::/);
    for (const [key, kind] of Object.entries(T)) {
      const category = mindmapCategories[kind];
      if (category === 'Keyword' || category === 'Operator') {
        expect(mindmapDocs[kind], key).toBeDefined();
      }
    }
  });
});
