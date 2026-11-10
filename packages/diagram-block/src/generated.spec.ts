import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { blockCategories } from './generated/categories.ts';
import { blockDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/block.ebnf` (D93, D94), for the language
 * facet (T6, #557): every kind has a highlight category, and the keywords and operators hover
 * explains have docs.
 */
describe('generated block tables', () => {
  it('categorise keywords, ids, texts, shape delimiters and links', () => {
    expect(blockCategories[T.Block]).toBe('Keyword');
    expect(blockCategories[T.IdBlock]).toBe('Keyword');
    expect(blockCategories[T.NodeId]).toBe('Variable');
    expect(blockCategories[T.Str]).toBe('String');
    expect(blockCategories[T.NodeDStart]).toBe('Punctuation');
    expect(blockCategories[T.Link]).toBe('Operator');
    expect(blockCategories[T.Size]).toBe('Number');
    expect(blockCategories[T.Dir]).toBe('Keyword');
  });

  it('document every keyword and operator kind', () => {
    expect(blockDocs[T.Block]).toMatch(/`block-beta`/);
    expect(blockDocs[T.IdBlock]).toMatch(/`block:id/);
    for (const [key, kind] of Object.entries(T)) {
      const category = blockCategories[kind];
      if (category === 'Keyword' || category === 'Operator') {
        expect(blockDocs[kind], key).toBeDefined();
      }
    }
  });
});
