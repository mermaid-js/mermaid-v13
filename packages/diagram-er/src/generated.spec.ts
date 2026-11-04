import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { erCategories } from './generated/categories.ts';
import { erDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/er.ebnf` (D93, D94), for the language
 * facet (T6): every kind has a highlight category, and the keywords hover explains have docs.
 */
describe('generated ER tables', () => {
  it('categorise keywords, operators, names and strings', () => {
    expect(erCategories[T.ErDiagram]).toBe('Keyword');
    expect(erCategories[T.Subgraph]).toBe('Keyword');
    expect(erCategories[T.OnlyOne]).toBe('Operator');
    expect(erCategories[T.Identifying]).toBe('Operator');
    expect(erCategories[T.UnicodeText]).toBe('Variable');
    expect(erCategories[T.AttributeComment]).toBe('String');
  });

  it('document every keyword and operator kind', () => {
    expect(erDocs[T.ErDiagram]).toMatch(/erDiagram/);
    expect(erDocs[T.ZeroOrMore]).toMatch(/relationship/);
    expect(erDocs[T.End]).toBe(erDocs[T.Subgraph]);
    expect(erDocs[T.AttributeKey]).toMatch(/PK/);
    for (const [key, kind] of Object.entries(T)) {
      const c = erCategories[kind];
      if (c === 'Keyword' || c === 'Operator') expect(erDocs[kind], key).toMatch(/\S/);
    }
  });
});
