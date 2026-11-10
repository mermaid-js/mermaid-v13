import { describe, expect, it } from 'vitest';
import { NOTATION_KINDS, T } from './parser/tokens.ts';
import type { RailroadNotation } from './parser/tokens.ts';
import { railroadCategories } from './generated/categories.ts';
import { railroadDocs } from './generated/docs.ts';
import { railroadAbnfCategories } from './generated/railroad-abnf.categories.ts';
import { railroadAbnfDocs } from './generated/railroad-abnf.docs.ts';
import { railroadEbnfCategories } from './generated/railroad-ebnf.categories.ts';
import { railroadEbnfDocs } from './generated/railroad-ebnf.docs.ts';
import { railroadPegCategories } from './generated/railroad-peg.categories.ts';
import { railroadPegDocs } from './generated/railroad-peg.docs.ts';

type Table = Readonly<Partial<Record<number, string>>>;

const TABLES: Readonly<Record<RailroadNotation, [categories: Table, docs: Table]>> = {
  railroad: [railroadCategories, railroadDocs],
  railroadEbnf: [railroadEbnfCategories, railroadEbnfDocs],
  railroadAbnf: [railroadAbnfCategories, railroadAbnfDocs],
  railroadPeg: [railroadPegCategories, railroadPegDocs],
};

/**
 * The tables `pnpm gen:grammar` makes from each notation's grammar file (D93, D94, D512), for
 * the language facet (T6): every kind of the notation has a highlight category, and the
 * keywords and operators hover explains have docs.
 */
describe.each(Object.keys(TABLES) as RailroadNotation[])('generated railroad tables (%s)', (n) => {
  const [categories, docs] = TABLES[n];

  it('categorise headers, names, strings and comments', () => {
    expect(categories[T.Header]).toBe('Keyword');
    expect(categories[T.Title]).toBe('Keyword');
    expect(categories[T.Id]).toBe('Variable');
    expect(categories[T.String]).toBe('String');
    expect(categories[T.Yaml]).toBe('Meta');
  });

  it('document every keyword and operator kind', () => {
    expect(docs[T.Header]).toMatch(/`railroad-(?:\w+-)?beta`/);
    for (const [key, kind] of Object.entries(NOTATION_KINDS[n])) {
      const c = categories[kind];
      if (c === 'Keyword' || c === 'Operator') expect(docs[kind], key).toMatch(/\S/);
    }
  });
});
