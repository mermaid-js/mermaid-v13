import { describe, expect, it } from 'vitest';
import { SankeyKind } from './parser/tokens.ts';
import { sankeyCategories } from './generated/categories.ts';
import { sankeyDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/sankey.ebnf` (D93, D94), for the language
 * facet (T6, #504): every kind has a highlight category, and the keyword hover explains has a
 * doc.
 */
describe('generated sankey tables', () => {
  it('categorise the keyword, the comma, quoted and unquoted fields', () => {
    expect(sankeyCategories[SankeyKind.Sankey]).toBe('Keyword');
    expect(sankeyCategories[SankeyKind.Comma]).toBe('Punctuation');
    expect(sankeyCategories[SankeyKind.Text]).toBe('Variable');
    expect(sankeyCategories[SankeyKind.OpenQuote]).toBe('String');
    expect(sankeyCategories[SankeyKind.EscapedText]).toBe('String');
    expect(sankeyCategories[SankeyKind.CloseQuote]).toBe('String');
  });

  it('document every keyword and operator kind', () => {
    expect(sankeyDocs[SankeyKind.Sankey]).toMatch(/`sankey`/);
    for (const [key, kind] of Object.entries(SankeyKind)) {
      const category = sankeyCategories[kind];
      if (category === 'Keyword' || category === 'Operator') {
        expect(sankeyDocs[kind], key).toBeDefined();
      }
    }
  });
});
