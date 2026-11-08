/**
 * Treemap highlighting (#511, language.md step 3): the four-way agreement of the kind → category
 * table with the generated TextMate, Monarch and Lezer grammars over the treemap corpus, as
 * `radar-agreement.spec.ts` checks radar.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectTreemap,
  treemapCategories,
  TreemapTokenKind as T,
  treemapTokens,
} from '@mermaid-js/diagram-treemap/language';
import { agreement, corpus, highlighters, ROOT } from './agreement-testing.ts';

/**
 * Where TextMate and Monarch, which read a line at a time, cannot follow a token that runs over
 * a line break (Lezer, which runs the patterns, agrees): a `classDef` with no styles on its line
 * takes the next line as its styles (D401's trap, `TREEMAP_CLASSDEF_NEXT_LINE`), only in the
 * warnings fixture. The block `accDescr { … }` is written as a span and agrees.
 */
const FIXTURE = '/e2e/diagrams/treemap/nightly-check/parser-warnings.mmd';
const LINE_BASED = Object.fromEntries(
  ['Monarch', 'TextMate'].flatMap((h) => [
    [`${h}: ClassDef is Keyword, highlighted Number`, `${FIXTURE} at 368`],
    [`${h}: ClassDef is Keyword, highlighted Punctuation`, `${FIXTURE} at 366`],
    [`${h}: ClassDef is Keyword, highlighted String`, `${FIXTURE} at 363`],
  ])
);

/**
 * Cases of `packages/conformance/corpus/treemap-cases.json` for the kinds and forms the e2e
 * corpus lacks: the text statements (`title`, `accTitle:`, `accDescr` on one line and as a
 * block), the `,` separator, single quotes and comments.
 */
const CASES = [
  'treemap-cases/title',
  'treemap-cases/title-indented',
  'treemap-cases/acc-title',
  'treemap-cases/acc-descr',
  'treemap-cases/acc-descr-block',
  'treemap-cases/acc-descr-block-inline',
  'treemap-cases/leaf-comma-separator',
  'treemap-cases/string-single',
  'treemap-cases/header-comment',
  'treemap-cases/classdef-semicolon',
  'treemap-cases/all-features',
];

function cases(): [string, string][] {
  const file = join(ROOT, 'packages/conformance/corpus/treemap-cases.json');
  const all = JSON.parse(readFileSync(file, 'utf8')) as { id: string; source: string }[];
  return CASES.map((id) => {
    const found = all.find((c) => c.id === id);
    if (!found) throw new Error(`no case ${id} in treemap-cases.json`);
    return [id, found.source];
  });
}

describe('four-way highlighting agreement (treemap)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectTreemap);
    expect(sources.length).toBeGreaterThan(20);
    const result = agreement(
      { kinds: T, categories: treemapCategories, tokens: treemapTokens },
      await highlighters('treemap'),
      [...cases(), ...sources],
      // A blank run is a token (v12's INDENTATION): it has no non-blank character to compare.
      [T.Indentation]
    );
    expect(result.disagreements).toEqual(LINE_BASED);
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
