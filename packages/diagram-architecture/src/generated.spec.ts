import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { architectureCategories } from './generated/categories.ts';
import { architectureDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/architecture.ebnf` (D93, D94), for the
 * language facet (T6): every kind has a highlight category, and the keywords hover explains
 * have docs.
 */
describe('generated architecture tables', () => {
  it('categorise keywords, operators, strings, ids and punctuation', () => {
    expect(architectureCategories[T.ArchitectureBeta]).toBe('Keyword');
    expect(architectureCategories[T.Service]).toBe('Keyword');
    expect(architectureCategories[T.Direction]).toBe('Keyword');
    expect(architectureCategories[T.Title]).toBe('Keyword');
    expect(architectureCategories[T.DashDash]).toBe('Operator');
    expect(architectureCategories[T.ArrowInto]).toBe('Operator');
    expect(architectureCategories[T.Label]).toBe('String');
    expect(architectureCategories[T.Icon]).toBe('String');
    expect(architectureCategories[T.String]).toBe('String');
    expect(architectureCategories[T.Id]).toBe('Variable');
    expect(architectureCategories[T.Colon]).toBe('Punctuation');
  });

  it('document every keyword and operator kind', () => {
    expect(architectureDocs[T.ArchitectureBeta]).toMatch(/architecture diagram/);
    expect(architectureDocs[T.Junction]).toMatch(/edges meet/);
    for (const [key, kind] of Object.entries(T)) {
      const c = architectureCategories[kind];
      if (c === 'Keyword' || c === 'Operator') expect(architectureDocs[kind], key).toMatch(/\S/);
    }
  });
});
