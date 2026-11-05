import { describe, expect, it } from 'vitest';
import { JISON_NAMES, JourneyTokenKind, parseJourney } from '@mermaid-js/diagram-journey';
import { mutator, random } from '../fuzz/mutator.ts';
import { journeyGrammarCorpus } from './corpus.ts';

/**
 * R-ERR-5: messages name constructs in Mermaid terms, never a token kind or grammar rule. We
 * break every journey corpus source in seeded ways and check every message produced.
 */
// The grammar's rule names that are not plain words (`statement`, `document` are).
const RULES = ['journeyDiagram'];
// Token names: jison terminals with an underscore or two capitals (`acc_title`, `taskName`),
// and v13 kind names that are compounds (`TaskName`, `AccDescrMultiline`, …).
const TOKENS = [
  ...Object.values(JISON_NAMES).filter((n) => /_|[A-Z].*[A-Z]|^[a-z]+[A-Z]/.test(n)),
  ...Object.keys(JourneyTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
  'NEWLINE',
  'INVALID',
  'EOF',
];
const BANNED = new RegExp(`\\b(?:${[...RULES, ...TOKENS].join('|')})\\b`);

const FRAGMENTS = [
  ':',
  ': 5',
  ': 5: Me',
  ',',
  ';',
  '\n',
  '#',
  '%%',
  '%',
  '{',
  '}',
  'section',
  'title',
];
const FRAGMENTS_MORE = ['accTitle:', 'accDescr:', 'accDescr {', 'journey', '\r\n', '  '];

describe('journey error messages', () => {
  it('never name a token or grammar rule', async () => {
    const corpus = (await journeyGrammarCorpus()).map((c) => c.source);
    const next = mutator(corpus, [...FRAGMENTS, ...FRAGMENTS_MORE], random(302));
    const bad: string[] = [];
    let errors = 0;
    for (let i = 0; i < 5000; i++) {
      const src = next();
      for (const d of parseJourney(src).diagnostics) {
        if (d.severity === 'error') errors++;
        if (BANNED.test(d.message) || d.expected?.some((e) => BANNED.test(e))) {
          bad.push(`${JSON.stringify(src)}: ${d.message}`);
        }
      }
    }
    expect(errors).toBeGreaterThan(1000);
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120_000);
});
