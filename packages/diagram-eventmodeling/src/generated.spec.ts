import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { eventmodelingCategories } from './generated/categories.ts';
import { eventmodelingDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/eventmodeling.ebnf` (D93, D94), for the
 * language facet (T6): every kind has a highlight category, and the keywords hover explains have
 * docs.
 */
describe('generated event modeling tables', () => {
  it('categorise keywords, numbers, strings, names and punctuation', () => {
    expect(eventmodelingCategories[T.Header]).toBe('Keyword');
    expect(eventmodelingCategories[T.Tf]).toBe('Keyword');
    expect(eventmodelingCategories[T.Evt]).toBe('Keyword');
    expect(eventmodelingCategories[T.Json]).toBe('Keyword');
    expect(eventmodelingCategories[T.Title]).toBe('Keyword');
    expect(eventmodelingCategories[T.Arrow]).toBe('Operator');
    expect(eventmodelingCategories[T.FrameId]).toBe('Number');
    expect(eventmodelingCategories[T.DataInline]).toBe('String');
    expect(eventmodelingCategories[T.DataBlock]).toBe('String');
    expect(eventmodelingCategories[T.Id]).toBe('Variable');
    expect(eventmodelingCategories[T.OpenRef]).toBe('Punctuation');
    expect(eventmodelingCategories[T.BlockComment]).toBe('Comment');
  });

  it('document every keyword kind', () => {
    expect(eventmodelingDocs[T.Header]).toMatch(/event model/);
    expect(eventmodelingDocs[T.Gwt]).toMatch(/given/);
    for (const [key, kind] of Object.entries(T)) {
      const c = eventmodelingCategories[kind];
      if (c === 'Keyword' || c === 'Operator') expect(eventmodelingDocs[kind], key).toMatch(/\S/);
    }
  });
});
