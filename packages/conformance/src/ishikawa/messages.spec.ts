import { describe, expect, it } from 'vitest';
import { parseIshikawa } from '@mermaid-js/diagram-ishikawa';
import { mutator, random } from '../fuzz/mutator.ts';
import { INTERNAL_NAMES, ishikawaCases, ishikawaCorpus, withoutQuotes } from './corpus.ts';

/**
 * R-ERR-5: messages name constructs in Mermaid terms, never a token kind or grammar rule
 * ({@link INTERNAL_NAMES}). We break every ishikawa corpus source in seeded ways and check every
 * message produced.
 */
const FRAGMENTS = ['\n', '\r\n', '\n\n', '  ', '\t', '%%', '%% c\n', ';', ' ', '<br>'];
const FRAGMENTS_MORE = [
  'ishikawa',
  'ishikawa-beta',
  'Ishikawa ',
  '\n  ishikawa x',
  '\n%%\n\n',
  '&amp;',
];

describe('ishikawa error messages', () => {
  it('never name a token or grammar rule', async () => {
    const corpus = [...(await ishikawaCorpus()), ...ishikawaCases()].map((c) => c.source);
    const next = mutator(corpus, [...FRAGMENTS, ...FRAGMENTS_MORE], random(519));
    const bad: string[] = [];
    let errors = 0;
    let warnings = 0;
    for (let i = 0; i < 5000; i++) {
      const src = next();
      for (const d of parseIshikawa(src).diagnostics) {
        if (d.severity === 'error') errors++;
        else warnings++;
        const related = d.related?.map((r) => r.message) ?? [];
        if (
          [d.message, ...related].some((m) => INTERNAL_NAMES.test(withoutQuotes(m))) ||
          d.expected?.some((e) => INTERNAL_NAMES.test(e))
        ) {
          bad.push(`${JSON.stringify(src)}: ${d.message}`);
        }
      }
    }
    expect(errors).toBeGreaterThan(1000);
    expect(warnings).toBeGreaterThan(100);
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120_000);
});
