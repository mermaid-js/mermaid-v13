import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { usecaseCategories } from './generated/categories.ts';
import { usecaseDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/usecase.ebnf` (D93, D94), for the language
 * facet (T6, #568): every kind has a highlight category, and the keywords and operators hover
 * explains have docs.
 */
describe('generated usecase tables', () => {
  it('categorise keywords, operators, ids, strings, numbers and colours', () => {
    expect(usecaseCategories[T.Actor]).toBe('Keyword');
    expect(usecaseCategories[T.SystemBoundary]).toBe('Keyword');
    expect(usecaseCategories[T.AccTitleLine]).toBe('Keyword');
    expect(usecaseCategories[T.ForwardSolid]).toBe('Operator');
    expect(usecaseCategories[T.MarkerlessSolid]).toBe('Operator');
    expect(usecaseCategories[T.BackwardSolid]).toBe('Operator');
    expect(usecaseCategories[T.Identifier]).toBe('Variable');
    expect(usecaseCategories[T.PlainString]).toBe('String');
    expect(usecaseCategories[T.MarkdownString]).toBe('String');
    expect(usecaseCategories[T.JsonObjectLiteral]).toBe('String');
    expect(usecaseCategories[T.Number]).toBe('Number');
    expect(usecaseCategories[T.HashColor]).toBe('Constant');
    expect(usecaseCategories[T.LabelSymbol]).toBe('Other');
  });

  it('document every keyword and operator kind', () => {
    expect(usecaseDocs[T.Generalization]).toMatch(/generalization/);
    expect(usecaseDocs[T.Include]).toMatch(/includes another/);
    for (const [key, kind] of Object.entries(T)) {
      const category = usecaseCategories[kind];
      if (category === 'Keyword' || category === 'Operator') {
        expect(usecaseDocs[kind], key).toBeDefined();
      }
    }
  });
});
