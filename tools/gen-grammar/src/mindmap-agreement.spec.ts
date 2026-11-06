/**
 * Mindmap highlighting (#389, language.md step 3): the four-way agreement of the kind →
 * category table with the generated TextMate, Monarch and Lezer grammars over the mindmap
 * corpus, as `timeline-agreement.spec.ts` checks timeline.
 */
import { describe, expect, it } from 'vitest';
import {
  detectMindmap,
  mindmapCategories,
  MindmapTokenKind as T,
  mindmapTokens,
} from '@mermaid-js/diagram-mindmap/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  ['shapes', 'mindmap\n  root((Root))\n    a[A]\n    b(B)\n    c)C(\n    d))D((\n    e{{E}}\n'],
  ['strings', 'mindmap\n  root\n    a["quoted"]\n    b["`**md**`"]\n'],
  ['decorations', 'mindmap\n  root\n    a\n    ::icon(fa fa-book)\n    :::urgent large\n'],
  ['bare class', 'mindmap\n  root\n    a\n    :::\n    b\n'],
  ['comments', 'mindmap\n  %% a comment\n  %%{init: {}}%%\n  root\n    a(A) %% kept\n\n    b\n'],
];

/** Kinds whose tokens are blanks or empty, so no highlighter colours them. */
const BLANK_KINDS: number[] = [T.Eof, T.SpaceList, T.ClassEnd];

describe('four-way highlighting agreement (mindmap)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectMindmap);
    expect(sources.length).toBeGreaterThan(20);
    const result = agreement(
      { kinds: T, categories: mindmapCategories, tokens: mindmapTokens },
      await highlighters('mindmap'),
      [...FIXTURES, ...sources],
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual({});
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
