import { describe, expect, it } from 'vitest';
import { parseVenn } from '@mermaid-js/diagram-venn';
import { mutator, random } from '../fuzz/mutator.ts';
import { INTERNAL_NAMES, vennCases, vennCorpus, withoutQuotes } from './corpus.ts';

/**
 * R-ERR-5: messages name constructs in Mermaid terms, never a token kind or grammar rule
 * ({@link INTERNAL_NAMES}). We break every venn corpus source in seeded ways and check every
 * message produced.
 */
const FRAGMENTS = ['[', ']', '["', '"]', '"', ',', ':', '\n', '\r\n', '  ', '\t', '%%', ';'];
const FRAGMENTS_MORE = [
  'venn-beta',
  'set ',
  'union ',
  'text ',
  'style ',
  'title ',
  '  text ',
  '#f00',
  'rgb(1,2,3)',
  '12',
  '-1',
  'fill: red',
  'Ä',
  '@',
  '{',
];

describe('venn error messages', () => {
  it('never name a token or grammar rule', async () => {
    const corpus = [...(await vennCorpus()), ...vennCases()].map((c) => c.source);
    const next = mutator(corpus, [...FRAGMENTS, ...FRAGMENTS_MORE], random(429));
    const bad: string[] = [];
    let errors = 0;
    for (let i = 0; i < 5000; i++) {
      const src = next();
      for (const d of parseVenn(src).diagnostics) {
        if (d.severity === 'error') errors++;
        if (
          INTERNAL_NAMES.test(withoutQuotes(d.message)) ||
          d.expected?.some((e) => INTERNAL_NAMES.test(e))
        ) {
          bad.push(`${JSON.stringify(src)}: ${d.message}`);
        }
      }
    }
    expect(errors).toBeGreaterThan(1000);
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120_000);
});
