import { describe, expect, it } from 'vitest';
import { c4betaCategories } from '../generated/c4beta.categories.ts';
import { c4betaDocs } from '../generated/c4beta.docs.ts';
import { T } from './tokens.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/c4beta.ebnf` (D93, D94, D512), for the
 * language facet to come: every kind has a highlight category, and the keywords and arrows
 * hover explains have docs.
 */
describe('generated c4-beta tables', () => {
  it('categorise keywords, arrows, text, tags and punctuation', () => {
    expect(c4betaCategories[T.Header]).toBe('Keyword');
    expect(c4betaCategories[T.SoftwareSystem]).toBe('Keyword');
    expect(c4betaCategories[T.Title]).toBe('Keyword');
    expect(c4betaCategories[T.ArrowRight]).toBe('Operator');
    expect(c4betaCategories[T.String]).toBe('String');
    expect(c4betaCategories[T.Tag]).toBe('Variable');
    expect(c4betaCategories[T.Id]).toBe('Variable');
    expect(c4betaCategories[T.Colon]).toBe('Punctuation');
    expect(c4betaCategories[T.Lbrace]).toBe('Punctuation');
  });

  it('document every keyword and operator kind', () => {
    expect(c4betaDocs[T.Header]).toMatch(/`c4-beta/);
    expect(c4betaDocs[T.ArrowBoth]).toMatch(/both ways/);
    for (const [key, kind] of Object.entries(T)) {
      const c = c4betaCategories[kind];
      if (c === 'Keyword' || c === 'Operator') expect(c4betaDocs[kind], key).toMatch(/\S/);
    }
  });
});
