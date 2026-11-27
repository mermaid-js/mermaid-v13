import { describe, expect, it } from 'vitest';
import { preprocess } from '@mermaid-js/core/preprocess';
import { JISON_NAMES, parseXyChart, XyChartTokenKind } from '@mermaid-js/diagram-xychart';
import { mutator, random } from '../fuzz/mutator.ts';
import { xyChartCases, xyChartCorpus } from './corpus.ts';

/**
 * R-ERR-5: messages name constructs in Mermaid terms, never a token kind or grammar rule, and
 * quote at most one line. We break every XY chart corpus source in seeded ways and check every
 * message produced.
 */
const RULES = [
  'alphaNumToken',
  'alphaNum',
  'dataPoints',
  'dataPoint',
  'plotData',
  'parseXAxis',
  'parseYAxis',
  'xAxisData',
  'yAxisData',
  'bandData',
  'commaSeparatedTexts',
  'chartConfig',
];
// Token names: jison terminals with `_`, `-` or all capitals, and v13 kind names that are
// compounds (`SquareBracesStart`, …); plain words such as `title` are Mermaid syntax.
const TOKENS = [
  ...Object.values(JISON_NAMES).filter((n) => /_|-|^[A-Z]{2,}$/.test(n)),
  ...Object.keys(XyChartTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
];
const BANNED = new RegExp(`\\b(?:${[...RULES, ...TOKENS].join('|')})\\b`);

const FRAGMENTS = ['[', ']', ',', '"', '\n', ';', '-->', ':', '(', '{', '}', '%%', '`', '.5'];
const FRAGMENTS_MORE = [
  'x-axis',
  'y-axis',
  'bar',
  'line',
  'title',
  'accDescr {',
  '2',
  'horizontal',
];

describe('xychart error messages', () => {
  it('never name a token or grammar rule', async () => {
    const corpus = [...(await xyChartCorpus()), ...xyChartCases()].map((c) => c.source);
    const next = mutator(corpus, [...FRAGMENTS, ...FRAGMENTS_MORE], random(426));
    const bad: string[] = [];
    let errors = 0;
    for (let i = 0; i < 5000; i++) {
      const src = next();
      // Core's preprocess diagnostics (directives, front matter) are core's to check.
      for (const d of parseXyChart(src, { preprocessed: preprocess(src) }).diagnostics) {
        if (d.severity === 'error') errors++;
        // A message quotes at most one line of the source.
        const lines = /[\n\r\u2028\u2029]/.test(d.message);
        if (lines || BANNED.test(d.message) || d.expected?.some((e) => BANNED.test(e))) {
          bad.push(`${JSON.stringify(src)}: ${d.message}`);
        }
      }
    }
    expect(errors).toBeGreaterThan(1000);
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120_000);
});
