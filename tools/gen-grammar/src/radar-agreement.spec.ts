/**
 * Radar highlighting (#450, language.md step 3): the four-way agreement of the kind → category
 * table with the generated TextMate, Monarch and Lezer grammars over the radar corpus, as
 * `pie-agreement.spec.ts` checks pie.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectRadar,
  radarCategories,
  RadarTokenKind as T,
  radarTokens,
} from '@mermaid-js/diagram-radar/language';
import { agreement, corpus, highlighters, ROOT } from './agreement-testing.ts';

/**
 * Where TextMate and Monarch, which read a line at a time, cannot follow two tokens that run
 * over line breaks (Lezer, which runs the patterns, agrees), as for pie: a label written over
 * lines (`D["g` newline `h"]`, only in that parser fixture), and a `---` … `---` block inside
 * the body (v12's skipped YAML token, only in `radar-cases/hidden-yaml`). The block `accDescr { … }`
 * is written as a span and agrees.
 */
const FIXTURE = '/e2e/diagrams/radar/nightly-check/parser-label-escapes.mmd';
const LINE_BASED = Object.fromEntries(
  ['Monarch', 'TextMate'].flatMap((h) => [
    [`${h}: String is String, highlighted Other`, `${FIXTURE} at 53`],
    [`${h}: String is String, highlighted Variable`, `${FIXTURE} at 54`],
    [`${h}: Yaml is Meta, highlighted Number`, 'radar-cases/hidden-yaml at 18'],
    [`${h}: Yaml is Meta, highlighted Other`, 'radar-cases/hidden-yaml at 11'],
    [`${h}: Yaml is Meta, highlighted Punctuation`, 'radar-cases/hidden-yaml at 16'],
    [`${h}: Yaml is Meta, highlighted Variable`, 'radar-cases/hidden-yaml at 15'],
  ])
);

/**
 * Cases of `packages/conformance/corpus/radar-cases.json` for the kinds the e2e corpus lacks:
 * the `radar-beta:` header, the accessibility statements, quotes, options, comments and
 * directives, keyword-prefixed names and a YAML block in the body.
 */
const CASES = [
  'radar-cases/header-colon',
  'radar-cases/acc-comments',
  'radar-cases/acc-descr-block',
  'radar-cases/render-acc-indented',
  'radar-cases/string-quotes',
  'radar-cases/options-all',
  'radar-cases/hidden-trailing',
  'radar-cases/keyword-names-split',
  'radar-cases/hidden-yaml',
];

function cases(): [string, string][] {
  const file = join(ROOT, 'packages/conformance/corpus/radar-cases.json');
  const all = JSON.parse(readFileSync(file, 'utf8')) as { id: string; source: string }[];
  return CASES.map((id) => {
    const found = all.find((c) => c.id === id);
    if (!found) throw new Error(`no case ${id} in radar-cases.json`);
    return [id, found.source];
  });
}

describe('four-way highlighting agreement (radar)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectRadar);
    expect(sources.length).toBeGreaterThan(10);
    const result = agreement(
      { kinds: T, categories: radarCategories, tokens: radarTokens },
      await highlighters('radar'),
      [...cases(), ...sources]
    );
    expect(result.disagreements).toEqual(LINE_BASED);
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
