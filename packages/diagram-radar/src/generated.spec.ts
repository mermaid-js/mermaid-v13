import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { radarCategories } from './generated/categories.ts';
import { radarDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/radar.ebnf` (D93, D94), for the language
 * facet (T6): every kind has a highlight category, and the keywords hover explains have docs.
 */
describe('generated radar tables', () => {
  it('categorise keywords, numbers, strings, names and punctuation', () => {
    expect(radarCategories[T.RadarBeta]).toBe('Keyword');
    expect(radarCategories[T.Axis]).toBe('Keyword');
    expect(radarCategories[T.GraticuleValue]).toBe('Keyword');
    expect(radarCategories[T.Title]).toBe('Keyword');
    expect(radarCategories[T.Number]).toBe('Number');
    expect(radarCategories[T.String]).toBe('String');
    expect(radarCategories[T.Id]).toBe('Variable');
    expect(radarCategories[T.LBrace]).toBe('Punctuation');
  });

  it('document every keyword kind', () => {
    expect(radarDocs[T.RadarBeta]).toMatch(/radar chart/);
    expect(radarDocs[T.Ticks]).toMatch(/32/);
    for (const [key, kind] of Object.entries(T)) {
      const c = radarCategories[kind];
      if (c === 'Keyword' || c === 'Operator') expect(radarDocs[kind], key).toMatch(/\S/);
    }
  });
});
