import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { c4Categories } from './generated/categories.ts';
import { c4Docs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/c4.ebnf` (D93, D94), for the language facet
 * (T6, #543): every kind has a highlight category, and the keywords hover explains have docs.
 */
describe('generated c4 tables', () => {
  it('categorise the headers, macros, arguments and punctuation', () => {
    expect(c4Categories[T.C4Context]).toBe('Keyword');
    expect(c4Categories[T.Person]).toBe('Keyword');
    expect(c4Categories[T.SystemQueueExt]).toBe('Keyword');
    expect(c4Categories[T.UpdateElementStyle]).toBe('Keyword');
    expect(c4Categories[T.Str]).toBe('String');
    expect(c4Categories[T.StrKey]).toBe('Variable');
    expect(c4Categories[T.StrValue]).toBe('String');
    expect(c4Categories[T.AccDescrBlockValue]).toBe('String');
    expect(c4Categories[T.ArgsOpen]).toBe('Punctuation');
    expect(c4Categories[T.ArgsClose]).toBe('Punctuation');
    expect(c4Categories[T.LBrace]).toBe('Punctuation');
  });

  it('document every keyword and operator kind', () => {
    expect(c4Docs[T.Person]).toMatch(/`Person\(alias/);
    expect(c4Docs[T.Rel]).toMatch(/`Rel\(from, to/);
    expect(c4Docs[T.Boundary]).toMatch(/`Boundary\(alias/);
    expect(c4Docs[T.Title]).toMatch(/`title <text>`/);
    for (const [key, kind] of Object.entries(T)) {
      const category = c4Categories[kind];
      if (category === 'Keyword' || category === 'Operator') {
        expect(c4Docs[kind], key).toBeDefined();
      }
    }
  });
});
