/**
 * XY chart highlighting (#512, language.md step 3): the four-way agreement of the kind →
 * category table with the generated TextMate, Monarch and Lezer grammars over the XY chart
 * corpus, as `kanban-agreement.spec.ts` checks kanban.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import {
  detectXyChart,
  xychartCategories,
  XyChartTokenKind as T,
  xyChartTokens,
} from '@mermaid-js/diagram-xychart/language';
import { agreement, corpus, highlighters, ROOT } from './agreement-testing.ts';

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  [
    'accessibility',
    'xychart\n  accTitle: Sales\n  accDescr: By month\n  accDescr {\n    two\n    lines\n  }\n  bar [1]\n',
  ],
  [
    'punctuation',
    'xychart\n  title a+b=c*d#e_f.g&h-1\n  x-axis "Q1: x" [a, b]\n  bar [1, 2] ; line [3, 4]\n',
  ],
  ['comments', 'xychart\n  %% a comment\n  bar [1] %% after\n'],
  ['colon', 'xychart\n  title a:b\n  bar [1]\n'],
];

/** v12's detector on the text from the diagram's first line (most fixtures set config first). */
const detect = (src: string) => detectXyChart(src.slice(diagramStart(src, preprocess(src))));

/**
 * Where TextMate and Monarch, which read a line at a time, cannot follow the dead markdown rule
 * (`T.DeadMdRule`), whose literal text runs over three lines (Lezer, which runs the patterns,
 * agrees), as radar pins its labels over lines: the rule's text after its first line, and the
 * plot after it, are read as the string it seems to open. Only in that one case.
 */
const DEAD = 'xychart-cases/md-string-dead-rule-text';
const LINE_BASED = Object.fromEntries(
  ['Monarch', 'TextMate'].flatMap((h) => [
    [`${h}: Alpha is Other, highlighted String`, `${DEAD} at 160`],
    [`${h}: Bar is Keyword, highlighted String`, `${DEAD} at 162`],
    [`${h}: DeadMdRule is String, highlighted Other`, `${DEAD} at 15`],
    [`${h}: NumberWithDecimal is Number, highlighted String`, `${DEAD} at 167`],
    [`${h}: SquareBracesEnd is Punctuation, highlighted String`, `${DEAD} at 168`],
    [`${h}: SquareBracesStart is Punctuation, highlighted String`, `${DEAD} at 166`],
  ])
);

/** Cases of `packages/conformance/corpus/xychart-cases.json` for the kinds the corpus lacks. */
const CASES = [DEAD];

function cases(): [string, string][] {
  const file = join(ROOT, 'packages/conformance/corpus/xychart-cases.json');
  const all = JSON.parse(readFileSync(file, 'utf8')) as { id: string; source: string }[];
  return CASES.map((id) => {
    const found = all.find((c) => c.id === id);
    if (!found) throw new Error(`no case ${id} in xychart-cases.json`);
    return [id, found.source];
  });
}

/** Kinds whose tokens are blanks or empty, so no highlighter colours them. */
const BLANK_KINDS: number[] = [T.Eof, T.Blanks];

describe('four-way highlighting agreement (xychart)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detect);
    expect(sources.length).toBeGreaterThan(20);
    const result = agreement(
      { kinds: T, categories: xychartCategories, tokens: xyChartTokens },
      await highlighters('xychart'),
      [...FIXTURES, ...cases(), ...sources],
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual(LINE_BASED);
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
