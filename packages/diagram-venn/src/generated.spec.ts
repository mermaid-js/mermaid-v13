import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { vennCategories } from './generated/categories.ts';
import { vennDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/venn.ebnf` (D93, D94), for the language
 * facet (T6, #498): every kind has a highlight category, and the keywords hover explains have
 * docs.
 */
describe('generated venn tables', () => {
  it('categorise keywords, ids, labels, strings, numbers and colours', () => {
    expect(vennCategories[T.Venn]).toBe('Keyword');
    expect(vennCategories[T.Set]).toBe('Keyword');
    expect(vennCategories[T.IndentTextKeyword]).toBe('Keyword');
    expect(vennCategories[T.Identifier]).toBe('Variable');
    expect(vennCategories[T.QuotedLabel]).toBe('String');
    expect(vennCategories[T.Label]).toBe('String');
    expect(vennCategories[T.String]).toBe('String');
    expect(vennCategories[T.Numeric]).toBe('Number');
    expect(vennCategories[T.HexColor]).toBe('Constant');
  });

  it('document every keyword kind', () => {
    expect(vennDocs[T.Venn]).toMatch(/`venn-beta`/);
    expect(vennDocs[T.Union]).toMatch(/10 \/ n²/);
    expect(vennDocs[T.IndentTextKeyword]).toMatch(/indented line/);
    for (const [key, kind] of Object.entries(T)) {
      const category = vennCategories[kind];
      if (category === 'Keyword' || category === 'Operator') {
        expect(vennDocs[kind], key).toBeDefined();
      }
    }
  });
});
