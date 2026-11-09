import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { requirementCategories } from './generated/categories.ts';
import { requirementDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/requirement.ebnf` (D93, D94), for the
 * language facet (T6): every kind has a highlight category, and the keywords hover explains
 * have a doc.
 */
describe('generated requirement tables', () => {
  it('categorise keywords, names, strings, styles and punctuation', () => {
    expect(requirementCategories[T.Rd]).toBe('Keyword');
    expect(requirementCategories[T.FunctionalRequirement]).toBe('Keyword');
    expect(requirementCategories[T.VerifyMethod]).toBe('Keyword');
    expect(requirementCategories[T.HighRisk]).toBe('Constant');
    expect(requirementCategories[T.EndArrowR]).toBe('Operator');
    expect(requirementCategories[T.UnqString]).toBe('Variable');
    expect(requirementCategories[T.Quote]).toBe('String');
    expect(requirementCategories[T.QString]).toBe('String');
    expect(requirementCategories[T.Alpha]).toBe('String');
    expect(requirementCategories[T.StructStart]).toBe('Punctuation');
  });

  it('document every keyword and operator kind', () => {
    expect(requirementDocs[T.Rd]).toMatch(/`requirementDiagram`/);
    expect(requirementDocs[T.Element]).toMatch(/`element name \{ … \}`/);
    for (const [key, kind] of Object.entries(T)) {
      const category = requirementCategories[kind];
      if (category === 'Keyword' || category === 'Operator') {
        expect(requirementDocs[kind], key).toBeDefined();
      }
    }
  });
});
