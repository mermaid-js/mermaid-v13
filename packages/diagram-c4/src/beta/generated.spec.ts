import { describe, expect, it } from 'vitest';
import { c4betaCategories } from '../generated/c4beta.categories.ts';
import { c4betaDocs } from '../generated/c4beta.docs.ts';
import { BETA } from './tokens.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/c4beta.ebnf` (D93, D94, D512), for the
 * language facet to come: every kind has a highlight category, and the keywords and arrows
 * hover explains have docs.
 */
describe('generated c4-beta tables', () => {
  it('categorise keywords, arrows, text, tags and punctuation', () => {
    expect(c4betaCategories[BETA.Header]).toBe('Keyword');
    expect(c4betaCategories[BETA.SoftwareSystem]).toBe('Keyword');
    expect(c4betaCategories[BETA.Title]).toBe('Keyword');
    expect(c4betaCategories[BETA.ArrowRight]).toBe('Operator');
    expect(c4betaCategories[BETA.String]).toBe('String');
    expect(c4betaCategories[BETA.Tag]).toBe('Variable');
    expect(c4betaCategories[BETA.Id]).toBe('Variable');
    expect(c4betaCategories[BETA.Colon]).toBe('Punctuation');
    expect(c4betaCategories[BETA.Lbrace]).toBe('Punctuation');
  });

  it('document every keyword and operator kind', () => {
    expect(c4betaDocs[BETA.Header]).toMatch(/`c4-beta/);
    expect(c4betaDocs[BETA.ArrowBoth]).toMatch(/both ways/);
    for (const [key, kind] of Object.entries(BETA)) {
      const c = c4betaCategories[kind];
      if (c === 'Keyword' || c === 'Operator') expect(c4betaDocs[kind], key).toMatch(/\S/);
    }
  });
});
