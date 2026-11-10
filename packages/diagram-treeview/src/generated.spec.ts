import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { treeviewCategories } from './generated/categories.ts';
import { treeviewDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/treeview.ebnf` (D93, D94), for the language
 * facet (T6): every kind has a highlight category, and the keywords hover explains have docs.
 */
describe('generated treeView tables', () => {
  it('categorise keywords, annotations, strings and names', () => {
    expect(treeviewCategories[T.TreeViewBeta]).toBe('Keyword');
    expect(treeviewCategories[T.Title]).toBe('Keyword');
    expect(treeviewCategories[T.ClassAnnotation]).toBe('Operator');
    expect(treeviewCategories[T.IconAnnotation]).toBe('Function');
    expect(treeviewCategories[T.DescAnnotation]).toBe('Comment');
    expect(treeviewCategories[T.QuotedName]).toBe('String');
    expect(treeviewCategories[T.BareName]).toBe('Variable');
  });

  it('document every keyword and operator kind', () => {
    expect(treeviewDocs[T.TreeViewBeta]).toMatch(/starts a tree view/);
    expect(treeviewDocs[T.ClassAnnotation]).toMatch(/:::name/);
    for (const [key, kind] of Object.entries(T)) {
      const c = treeviewCategories[kind];
      if (c === 'Keyword' || c === 'Operator') expect(treeviewDocs[kind], key).toMatch(/\S/);
    }
  });
});
