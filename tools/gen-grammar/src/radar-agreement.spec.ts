/**
 * Radar highlighting (#450, language.md step 3): the four-way agreement of the kind → category
 * table with the generated TextMate, Monarch and Lezer grammars over the radar corpus, as
 * `pie-agreement.spec.ts` checks pie.
 */
import { describe, expect, it } from 'vitest';
import {
  detectRadar,
  radarCategories,
  RadarTokenKind as T,
  radarTokens,
} from '@mermaid-js/diagram-radar/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/**
 * Where TextMate and Monarch, which read a line at a time, cannot follow two tokens that run
 * over line breaks (Lezer, which runs the patterns, agrees), as for pie: a label written over
 * lines (`D["g` newline `h"]`, only in that parser fixture), and a `---` … `---` block inside
 * the body (v12's skipped YAML token, only in the fixture below). The block `accDescr { … }`
 * is written as a span and agrees.
 */
const FIXTURE = '/e2e/diagrams/radar/nightly-check/parser-label-escapes.mmd';
const LINE_BASED = Object.fromEntries(
  ['Monarch', 'TextMate'].flatMap((h) => [
    [`${h}: String is String, highlighted Other`, `${FIXTURE} at 53`],
    [`${h}: String is String, highlighted Variable`, `${FIXTURE} at 54`],
    [`${h}: Yaml is Meta, highlighted Number`, 'yaml in the body at 18'],
    [`${h}: Yaml is Meta, highlighted Other`, 'yaml in the body at 11'],
    [`${h}: Yaml is Meta, highlighted Punctuation`, 'yaml in the body at 16'],
    [`${h}: Yaml is Meta, highlighted Variable`, 'yaml in the body at 15'],
  ])
);

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  ['headers', 'radar-beta:\n  axis A\n'],
  [
    'acc',
    'radar-beta\n  title Skills\n  accTitle: Skills\n  accDescr: one line\n  accDescr {\n    multi\n  }\n',
  ],
  [
    'values',
    "radar-beta\n  axis A['Alpha'], B\n  curve c{A: 1, B 2.5}\n  showLegend false\n  graticule polygon\n  ticks 3 max 5 min 0\n",
  ],
  ['comments', 'radar-beta\n  %% a comment\n  %%{init: {}}%%\n  axis A %% after\n'],
  ['keyword-prefixed', 'radar-beta\n  axis circles, trueish\n'],
  ['yaml in the body', 'radar-beta\n---\nx: 1\n---\n  axis A'],
];

describe('four-way highlighting agreement (radar)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectRadar);
    expect(sources.length).toBeGreaterThan(10);
    const result = agreement(
      { kinds: T, categories: radarCategories, tokens: radarTokens },
      await highlighters('radar'),
      [...FIXTURES, ...sources]
    );
    expect(result.disagreements).toEqual(LINE_BASED);
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
