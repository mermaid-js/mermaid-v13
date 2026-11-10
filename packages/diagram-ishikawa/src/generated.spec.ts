import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { ishikawaCategories } from './generated/categories.ts';
import { ishikawaDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/ishikawa.ebnf` (D93, D94), for the language
 * facet (`language.ts`, #584): every kind has a highlight category, and the keyword hover
 * explains has a doc.
 */
describe('generated ishikawa tables', () => {
  it('categorise the keyword, comments and the text of a line', () => {
    expect(ishikawaCategories[T.Ishikawa]).toBe('Keyword');
    expect(ishikawaCategories[T.CommentLine]).toBe('Comment');
    expect(ishikawaCategories[T.SpaceLine]).toBe('Other');
    expect(ishikawaCategories[T.Text]).toBe('String');
  });

  it('document every keyword kind', () => {
    expect(ishikawaDocs[T.Ishikawa]).toMatch(/`ishikawa-beta` or `ishikawa`/);
    for (const [key, kind] of Object.entries(T)) {
      const category = ishikawaCategories[kind];
      if (category === 'Keyword' || category === 'Operator') {
        expect(ishikawaDocs[kind], key).toBeDefined();
      }
    }
  });
});
