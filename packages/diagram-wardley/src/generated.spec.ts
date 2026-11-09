import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { wardleyCategories } from './generated/categories.ts';
import { wardleyDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/wardley.ebnf` (D93, D94), for the language
 * facet (T6): every kind has a highlight category, and the keywords hover explains have docs.
 */
describe('generated wardley tables', () => {
  it('categorise keywords, numbers, strings, names and punctuation', () => {
    expect(wardleyCategories[T.WardleyBeta]).toBe('Keyword');
    expect(wardleyCategories[T.Component]).toBe('Keyword');
    expect(wardleyCategories[T.Strategy]).toBe('Keyword');
    expect(wardleyCategories[T.Title]).toBe('Keyword');
    expect(wardleyCategories[T.Arrow]).toBe('Operator');
    expect(wardleyCategories[T.Decimal]).toBe('Number');
    expect(wardleyCategories[T.Int]).toBe('Number');
    expect(wardleyCategories[T.String]).toBe('String');
    expect(wardleyCategories[T.LinkLabel]).toBe('String');
    expect(wardleyCategories[T.Name]).toBe('Variable');
    expect(wardleyCategories[T.Id]).toBe('Variable');
    expect(wardleyCategories[T.LBracket]).toBe('Punctuation');
  });

  it('document every keyword kind', () => {
    expect(wardleyDocs[T.WardleyBeta]).toMatch(/Wardley map/);
    expect(wardleyDocs[T.Pipeline]).toMatch(/pipeline/);
    for (const [key, kind] of Object.entries(T)) {
      const c = wardleyCategories[kind];
      if (c === 'Keyword' || c === 'Operator') expect(wardleyDocs[kind], key).toMatch(/\S/);
    }
  });
});
