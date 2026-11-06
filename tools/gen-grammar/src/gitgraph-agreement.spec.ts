/**
 * gitGraph highlighting (#372, language.md step 3): the four-way agreement of the kind →
 * category table with the generated TextMate, Monarch and Lezer grammars over the gitGraph
 * corpus, as `pie-agreement.spec.ts` checks pie.
 */
import { describe, expect, it } from 'vitest';
import {
  detectGitGraph,
  gitgraphCategories,
  GitGraphTokenKind as T,
  gitGraphTokens,
} from '@mermaid-js/diagram-gitgraph/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/**
 * Where TextMate and Monarch, which read a line at a time, cannot follow two tokens that run
 * over line breaks (Lezer, which runs the patterns, agrees), as for pie: a string written over
 * lines (one corpus file has a branch label over two lines), and a `---` … `---` block inside
 * the body (v12's skipped YAML token; only the fixture has one).
 */
const MULTI_LINE =
  '/e2e/diagrams/git/nightly-check/97-should-render-branch-labels-with-multi-line-text-aligned-with-background-in-lr-layout.mmd';
const LINE_BASED = Object.fromEntries(
  ['Monarch', 'TextMate'].flatMap((h) => [
    [`${h}: String is String, highlighted Other`, `${MULTI_LINE} at 276`],
    [`${h}: String is String, highlighted Variable`, `${MULTI_LINE} at 277`],
    [`${h}: Yaml is Meta, highlighted Number`, 'yaml in the body at 16'],
    [`${h}: Yaml is Meta, highlighted Other`, 'yaml in the body at 9'],
    [`${h}: Yaml is Meta, highlighted Punctuation`, 'yaml in the body at 14'],
    [`${h}: Yaml is Meta, highlighted Variable`, 'yaml in the body at 13'],
  ])
);

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  ['headers', 'gitGraph:\n  commit\n'],
  ['directions', 'gitGraph BT:\n  commit\n'],
  ['acc', 'gitGraph\n  accTitle: Flow\n  accDescr: one line\n  accDescr {\n    multi\n  }\n'],
  ['title', 'gitGraph\n  title Release flow %% c\n  commit'],
  [
    'options',
    `gitGraph TB:\n  commit id:"A" msg:"m" tag:'v1' type: REVERSE\n  commit "bare" type: NORMAL\n  branch dev order: 2\n  switch dev\n  commit type: HIGHLIGHT\n  checkout main\n  merge dev id:"M"\n  cherry-pick id:"A" parent:"M" tag:"x"`,
  ],
  ['comments', 'gitGraph\n  %% a comment\n  %%{init: {}}%%\n  commit %% after\n'],
  ['multi-line directive', 'gitGraph\n  %%{\n    init: {}\n  }%%\n  commit'],
  ['yaml in the body', 'gitGraph\n---\nx: 1\n---\n  commit'],
  ['invalid', 'gitGraph\n  commit id:A ;\n  branch "open'],
];

describe('four-way highlighting agreement (gitGraph)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectGitGraph);
    expect(sources.length).toBeGreaterThan(100);
    const result = agreement(
      { kinds: T, categories: gitgraphCategories, tokens: gitGraphTokens },
      await highlighters('gitgraph'),
      [...FIXTURES, ...sources]
    );
    expect(result.disagreements).toEqual(LINE_BASED);
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
