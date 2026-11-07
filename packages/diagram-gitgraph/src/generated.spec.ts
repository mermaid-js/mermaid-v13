import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { gitgraphCategories } from './generated/categories.ts';
import { gitgraphDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/gitgraph.ebnf` (D93, D94), for the language
 * facet (#372): every kind has a highlight category, and the keywords hover explains have docs.
 */
describe('generated gitGraph tables', () => {
  it('categorise keywords, names, numbers, strings and punctuation', () => {
    expect(gitgraphCategories[T.GitGraph]).toBe('Keyword');
    expect(gitgraphCategories[T.CherryPick]).toBe('Keyword');
    expect(gitgraphCategories[T.Id]).toBe('Keyword');
    expect(gitgraphCategories[T.Reference]).toBe('Variable');
    expect(gitgraphCategories[T.Int]).toBe('Number');
    expect(gitgraphCategories[T.String]).toBe('String');
    expect(gitgraphCategories[T.Colon]).toBe('Punctuation');
  });

  it('document every keyword kind', () => {
    expect(gitgraphDocs[T.Commit]).toMatch(/a commit on the current branch/);
    expect(gitgraphDocs[T.CherryPick]).toMatch(/a copy of commit/);
    for (const [key, kind] of Object.entries(T)) {
      const c = gitgraphCategories[kind];
      if (c === 'Keyword' || c === 'Operator') expect(gitgraphDocs[kind], key).toMatch(/\S/);
    }
  });
});
