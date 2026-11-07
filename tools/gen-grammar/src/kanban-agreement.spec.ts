/**
 * Kanban highlighting (#463, language.md step 3): the four-way agreement of the kind →
 * category table with the generated TextMate, Monarch and Lezer grammars over the kanban
 * corpus, as `mindmap-agreement.spec.ts` checks mindmap.
 */
import { describe, expect, it } from 'vitest';
import {
  detectKanban,
  kanbanCategories,
  KanbanTokenKind as T,
  kanbanTokens,
} from '@mermaid-js/diagram-kanban/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  ['shapes', 'kanban\n  todo((Todo))\n    a[A]\n    b(B)\n    c)C(\n    d))D((\n    e{{E}}\n'],
  ['strings', 'kanban\n  todo\n    a["quoted"]\n    b["`**md**`"]\n'],
  ['decorations', 'kanban\n  todo\n    a\n    ::icon(fa fa-book)\n    :::urgent large\n'],
  ['bare class', 'kanban\n  todo\n    a\n    :::\n    b\n'],
  [
    'shape data',
    'kanban\n  todo\n    a@{ ticket: T-1, assigned: "knsv" }\n    b@{\n      priority: High\n    }\n',
  ],
  ['comments', 'kanban\n  %% a comment\n  %%{init: {}}%%\n  todo\n    a(A) %% kept\n\n    b\n'],
];

/** Kinds whose tokens are blanks or empty, so no highlighter colours them. */
const BLANK_KINDS: number[] = [T.Eof, T.SpaceList, T.ClassEnd];

describe('four-way highlighting agreement (kanban)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectKanban);
    expect(sources.length).toBeGreaterThan(20);
    const result = agreement(
      { kinds: T, categories: kanbanCategories, tokens: kanbanTokens },
      await highlighters('kanban'),
      [...FIXTURES, ...sources],
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual({});
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
