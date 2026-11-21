import { describe, expect, it } from 'vitest';
import { ErTokenKind, JISON_NAMES, parseEr } from '@mermaid-js/diagram-er';
import { mutator, random } from '../fuzz/mutator.ts';
import { erCorpus } from './grammar/corpus.ts';

/**
 * R-ERR-5: messages name constructs in Mermaid terms, never a token kind or grammar rule. We
 * break every ER corpus source in seeded ways and check every message produced.
 */
const RULES = [
  'entityName',
  'relSpec',
  'idList',
  'stylesOpt',
  'styleComponent',
  'attributeType',
  'attributeName',
  'attributeKeyTypeList',
  'attributeComment',
  'subgraphHeader',
  'subgraphTitle',
  'classDefStatement',
  'classStatement',
  'styleStatement',
];
// Token names: jison terminals with an underscore or two capitals, and v13 kind names that
// are compounds (`EntityName`, `BlockStart`, …); plain words such as `end` are Mermaid syntax.
const TOKENS = [
  ...Object.values(JISON_NAMES).filter((n) => /_|[A-Z].*[A-Z]/.test(n)),
  ...Object.keys(ErTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
];
const BANNED = new RegExp(`\\b(?:${[...RULES, ...TOKENS].join('|')})\\b`);

const FRAGMENTS = ['||--o{', '}|..', ':', ':::', '{', '}', '[', ']', '"', '\n', '?', ',', '~', '`'];
const FRAGMENTS_MORE = [
  'subgraph',
  'end',
  'style',
  'classDef x',
  'class',
  'PK',
  '(',
  '&',
  ';',
  '=',
];

/**
 * The message without the author's own text: a backticked span that quotes the source (`ErDiagram`
 * written as a name, or the quoted form a message suggests for it) is the author's word, not a
 * token kind that happens to share its spelling.
 */
const ownWords = (message: string, source: string): string =>
  message.replace(/`"?([^`"]+)"?`/g, (span: string, text: string) =>
    source.includes(text) ? '' : span
  );

describe('ER error messages', () => {
  it('never name a token or grammar rule', async () => {
    const corpus = (await erCorpus()).map((c) => c.source);
    const next = mutator(corpus, [...FRAGMENTS, ...FRAGMENTS_MORE], random(131));
    const bad: string[] = [];
    let errors = 0;
    for (let i = 0; i < 5000; i++) {
      const src = next();
      for (const d of parseEr(src).diagnostics) {
        if (d.severity === 'error') errors++;
        if (BANNED.test(ownWords(d.message, src)) || d.expected?.some((e) => BANNED.test(e))) {
          bad.push(`${JSON.stringify(src)}: ${d.message}`);
        }
      }
    }
    expect(errors).toBeGreaterThan(1000);
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120_000);
});
