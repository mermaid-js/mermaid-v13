import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { cynefinCategories } from './generated/categories.ts';
import { cynefinDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/cynefin.ebnf` (D93, D94), for the language
 * facet (T6, #470): every kind has a highlight category, and the keywords hover explains have
 * docs.
 */
describe('generated cynefin tables', () => {
  it('categorise keywords, operators, strings and punctuation', () => {
    expect(cynefinCategories[T.Header]).toBe('Keyword');
    expect(cynefinCategories[T.HeaderColon]).toBe('Keyword');
    expect(cynefinCategories[T.DomainName]).toBe('Keyword');
    expect(cynefinCategories[T.Title]).toBe('Keyword');
    expect(cynefinCategories[T.Arrow]).toBe('Operator');
    expect(cynefinCategories[T.String]).toBe('String');
    expect(cynefinCategories[T.Colon]).toBe('Punctuation');
    expect(cynefinCategories[T.Yaml]).toBe('Meta');
  });

  it('document every keyword and operator kind', () => {
    expect(cynefinDocs[T.Header]).toMatch(/five domains/);
    expect(cynefinDocs[T.DomainName]).toMatch(/confusion/);
    expect(cynefinDocs[T.Arrow]).toMatch(/transition/);
    for (const [key, kind] of Object.entries(T)) {
      const c = cynefinCategories[kind];
      if (c === 'Keyword' || c === 'Operator') expect(cynefinDocs[kind], key).toMatch(/\S/);
    }
  });
});
