/**
 * TreeView highlighting (#576, language.md step 3): the four-way agreement of the kind →
 * category table with the generated TextMate, Monarch and Lezer grammars over the treeView
 * corpus, as `treemap-agreement.spec.ts` checks treemap.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectTreeView,
  treeviewCategories,
  TreeViewTokenKind as T,
  treeViewTokens,
} from '@mermaid-js/diagram-treeview/language';
import { agreement, corpus, highlighters, ROOT } from './agreement-testing.ts';

/**
 * Where the highlighters, which read the source, cannot follow the box-drawing pass (D486): on a
 * box-drawn line the lexer's INDENTATION covers the whole `├── ` prefix the pass rewrote into an
 * indent, while the grammars read its glyphs as a name. INDENTATION has no other non-blank
 * character, so these are the box prefixes alone.
 */
const BOX = '/e2e/diagrams/tree-view/nightly-check/box-convert-a-simple-tree.mmd at 20';
const BOX_PREFIX = Object.fromEntries(
  ['Lezer', 'Monarch', 'TextMate'].map((h) => [
    `${h}: Indentation is Other, highlighted Variable`,
    BOX,
  ])
);

/**
 * Cases of `packages/conformance/corpus/treeView-cases.json` for the kinds and forms the e2e
 * corpus lacks: the text statements (`title`, `accTitle:`, `accDescr` on one line and as a
 * block), single quotes, comments, a directive and tabs.
 */
const CASES = [
  'treeView-cases/title-basic',
  'treeView-cases/acc-title',
  'treeView-cases/acc-descr',
  'treeView-cases/acc-descr-block',
  'treeView-cases/acc-all',
  'treeView-cases/acc-indented',
  'treeView-cases/quoted-single',
  'treeView-cases/comment-line',
  'treeView-cases/comment-after-annotation',
  'treeView-cases/annotations-tabs',
  'treeView-cases/directive-in-body',
];

function cases(): [string, string][] {
  const file = join(ROOT, 'packages/conformance/corpus/treeView-cases.json');
  const all = JSON.parse(readFileSync(file, 'utf8')) as { id: string; source: string }[];
  return CASES.map((id) => {
    const found = all.find((c) => c.id === id);
    if (!found) throw new Error(`no case ${id} in treeView-cases.json`);
    return [id, found.source];
  });
}

describe('four-way highlighting agreement (treeView)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectTreeView);
    expect(sources.length).toBeGreaterThan(50);
    const result = agreement(
      { kinds: T, categories: treeviewCategories, tokens: treeViewTokens },
      await highlighters('treeview'),
      [...cases(), ...sources],
      // A blank run is a token (v12's INDENTATION): it has no non-blank character to compare.
      [T.Indentation]
    );
    expect(result.disagreements).toEqual(BOX_PREFIX);
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
