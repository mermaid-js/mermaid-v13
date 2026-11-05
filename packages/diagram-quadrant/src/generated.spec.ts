import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { quadrantCategories } from './generated/categories.ts';
import { quadrantDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/quadrant.ebnf` (D93, D94), for the language
 * facet (T6, #321): every kind has a highlight category, and the keywords hover explains have
 * docs.
 */
describe('generated quadrant tables', () => {
  it('categorise keywords, operators, names and strings', () => {
    expect(quadrantCategories[T.Quadrant]).toBe('Keyword');
    expect(quadrantCategories[T.XAxis]).toBe('Keyword');
    expect(quadrantCategories[T.AxisTextDelimiter]).toBe('Operator');
    expect(quadrantCategories[T.ClassName]).toBe('Variable');
    expect(quadrantCategories[T.Str]).toBe('String');
    expect(quadrantCategories[T.PointX]).toBe('Number');
  });

  it('document every keyword and operator kind', () => {
    expect(quadrantDocs[T.Quadrant]).toMatch(/quadrantChart/);
    expect(quadrantDocs[T.Quadrant4]).toBe(quadrantDocs[T.Quadrant1]);
    expect(quadrantDocs[T.ClassDef]).toMatch(/classDef/);
    for (const [key, kind] of Object.entries(T)) {
      const c = quadrantCategories[kind];
      if ((c === 'Keyword' || c === 'Operator') && quadrantDocs[kind] === undefined) {
        // `accDescr {` and `:::` have no terminal of their own (jison returns none).
        expect(['AccDescrMultiline', 'AccDescrMultilineEnd', 'ClassMarker'], key).toContain(key);
      }
    }
  });
});
