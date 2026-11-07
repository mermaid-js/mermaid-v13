import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { ganttCategories } from './generated/categories.ts';
import { ganttDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/gantt.ebnf` (D93, D94), for the language
 * facet (T6, #382): every kind has a highlight category, and the keywords hover explains have
 * docs.
 */
describe('generated gantt tables', () => {
  it('categorise keywords, task texts and data', () => {
    expect(ganttCategories[T.Gantt]).toBe('Keyword');
    expect(ganttCategories[T.DateFormat]).toBe('Keyword');
    expect(ganttCategories[T.Section]).toBe('Keyword');
    expect(ganttCategories[T.TaskText]).toBe('Variable');
    expect(ganttCategories[T.TaskData]).toBe('String');
    expect(ganttCategories[T.ClickId]).toBe('Variable');
  });

  it('document every keyword kind', () => {
    expect(ganttDocs[T.Gantt]).toMatch(/gantt/);
    expect(ganttDocs[T.Excludes]).toMatch(/excludes/);
    for (const [key, kind] of Object.entries(T)) {
      if (ganttCategories[kind] === 'Keyword' && ganttDocs[kind] === undefined) {
        // `accDescr {` and its `}`, and the weekday/weekend days after the first: one doc each.
        expect(key).toMatch(/^(AccDescrMultiline|AccDescrMultilineEnd|Weekday|Weekend)/);
      }
    }
  });
});
