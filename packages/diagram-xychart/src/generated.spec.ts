import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { xychartCategories } from './generated/categories.ts';
import { xychartDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/xychart.ebnf` (D93, D94), for the language
 * facet (T6, #512): every kind has a highlight category, and the keywords hover explains have
 * docs.
 */
describe('generated xychart tables', () => {
  it('categorise keywords, operators, numbers and strings', () => {
    expect(xychartCategories[T.XyChart]).toBe('Keyword');
    expect(xychartCategories[T.XAxis]).toBe('Keyword');
    expect(xychartCategories[T.ChartOrientation]).toBe('Keyword');
    expect(xychartCategories[T.ArrowDelimiter]).toBe('Operator');
    expect(xychartCategories[T.NumberWithDecimal]).toBe('Number');
    expect(xychartCategories[T.Str]).toBe('String');
  });

  it('document every keyword and operator kind', () => {
    expect(xychartDocs[T.XyChart]).toMatch(/xychart-beta/);
    expect(xychartDocs[T.Bar]).toBe(xychartDocs[T.Line]);
    expect(xychartDocs[T.ArrowDelimiter]).toMatch(/-->/);
    for (const [key, kind] of Object.entries(T)) {
      const c = xychartCategories[kind];
      if ((c === 'Keyword' || c === 'Operator') && xychartDocs[kind] === undefined) {
        // `accDescr {` and its `}` have no terminal of their own (jison returns none).
        expect(['AccDescrMultiline', 'AccDescrMultilineEnd'], key).toContain(key);
      }
    }
  });
});
