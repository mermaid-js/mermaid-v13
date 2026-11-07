import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { packetCategories } from './generated/categories.ts';
import { packetDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/packet.ebnf` (D93, D94), for the language
 * facet (T6): every kind has a highlight category, and the keywords hover explains have docs.
 */
describe('generated packet tables', () => {
  it('categorise keywords, numbers, strings and punctuation', () => {
    expect(packetCategories[T.Packet]).toBe('Keyword');
    expect(packetCategories[T.PacketBeta]).toBe('Keyword');
    expect(packetCategories[T.Title]).toBe('Keyword');
    expect(packetCategories[T.Int]).toBe('Number');
    expect(packetCategories[T.String]).toBe('String');
    expect(packetCategories[T.Dash]).toBe('Punctuation');
    expect(packetCategories[T.Plus]).toBe('Punctuation');
    expect(packetCategories[T.Yaml]).toBe('Meta');
  });

  it('document every keyword kind', () => {
    expect(packetDocs[T.Packet]).toMatch(/packet diagram/);
    expect(packetDocs[T.Colon]).toMatch(/field/);
    for (const [key, kind] of Object.entries(T)) {
      const c = packetCategories[kind];
      if (c === 'Keyword' || c === 'Operator') expect(packetDocs[kind], key).toMatch(/\S/);
    }
  });
});
