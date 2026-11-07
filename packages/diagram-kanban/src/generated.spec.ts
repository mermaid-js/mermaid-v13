import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { kanbanCategories } from './generated/categories.ts';
import { kanbanDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/kanban.ebnf` (D93, D94), for the language
 * facet (T6, #463): every kind has a highlight category, and the keywords and operators hover
 * explains have docs.
 */
describe('generated kanban tables', () => {
  it('categorise the keyword, ids, texts, shape delimiters and shape data', () => {
    expect(kanbanCategories[T.Kanban]).toBe('Keyword');
    expect(kanbanCategories[T.NodeId]).toBe('Variable');
    expect(kanbanCategories[T.NodeDescr]).toBe('String');
    expect(kanbanCategories[T.NodeDStart]).toBe('Punctuation');
    expect(kanbanCategories[T.Class]).toBe('Variable');
    expect(kanbanCategories[T.SpaceLine]).toBe('Comment');
    expect(kanbanCategories[T.ShapeDataStart]).toBe('Meta');
    expect(kanbanCategories[T.ShapeData]).toBe('Meta');
    expect(kanbanCategories[T.ShapeDataStr]).toBe('String');
  });

  it('document every keyword and operator kind', () => {
    expect(kanbanDocs[T.Kanban]).toMatch(/`kanban`/);
    expect(kanbanDocs[T.IconStart]).toMatch(/::icon/);
    expect(kanbanDocs[T.ClassStart]).toMatch(/:::/);
    for (const [key, kind] of Object.entries(T)) {
      const category = kanbanCategories[kind];
      if (category === 'Keyword' || category === 'Operator') {
        expect(kanbanDocs[kind], key).toBeDefined();
      }
    }
  });
});
