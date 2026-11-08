import { describe, expect, it } from 'vitest';
import { parseSankey } from '@mermaid-js/diagram-sankey';
import { JISON_NAMES, SankeyTokenKind } from '@mermaid-js/diagram-sankey/testing';
import { mutator, random } from '../fuzz/mutator.ts';
import { sankeyCases, sankeyCorpus } from './corpus.ts';

/**
 * R-ERR-5: messages name constructs in Mermaid terms, never a token kind or grammar rule. We
 * break every sankey corpus source in seeded ways and check every message produced.
 */
// v12's rules with `_` (`record`, `field`, `csv`, `escaped` are plain words).
const RULES = ['csv_tail', 'opt_eof', 'non_escaped'];
// Token names: jison terminals with `_` or all capitals, and v13 kind names that are compounds
// (`OpenQuote`, `EscapedText`); plain words such as `sankey` are Mermaid syntax.
const TOKENS = [
  ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$/.test(n)),
  ...Object.keys(SankeyTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
];
const BANNED = new RegExp(`\\b(?:${[...RULES, ...TOKENS].join('|')})\\b`);
/** The author's own text a message quotes: a name or value, and what was found. */
const quoted = (message: string): string =>
  message.replace(/"[\s\S]*?"/g, '""').replace(/got `[\s\S]*?`/g, 'got `…`');

const FRAGMENTS = [',', '"', '""', '\n', '\r\n', ' ', '  \n', 'sankey', 'sankey-beta'];
const FRAGMENTS_MORE = ['%%', '%% c\n', '\t', 'é', '#9829;', 'abc', '-1', '1;', 'title x', '1e'];

describe('sankey error messages', () => {
  it('never name a token or grammar rule', async () => {
    const corpus = [...(await sankeyCorpus()), ...sankeyCases()].map((c) => c.source);
    const next = mutator(corpus, [...FRAGMENTS, ...FRAGMENTS_MORE], random(427));
    const bad: string[] = [];
    let errors = 0;
    for (let i = 0; i < 5000; i++) {
      const src = next();
      for (const d of parseSankey(src).diagnostics) {
        if (d.severity === 'error') errors++;
        const texts = [d.message, ...(d.related ?? []).map((r) => r.message)];
        if (texts.some((t) => BANNED.test(quoted(t))) || d.expected?.some((e) => BANNED.test(e))) {
          bad.push(`${JSON.stringify(src)}: ${d.message}`);
        }
      }
    }
    expect(errors).toBeGreaterThan(1000);
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120_000);
});
