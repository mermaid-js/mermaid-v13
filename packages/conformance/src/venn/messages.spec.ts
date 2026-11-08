import { describe, expect, it } from 'vitest';
import { JISON_NAMES, parseVenn, VennTokenKind } from '@mermaid-js/diagram-venn';
import { mutator, random } from '../fuzz/mutator.ts';
import { vennCases, vennCorpus } from './corpus.ts';

/**
 * R-ERR-5: messages name constructs in Mermaid terms, never a token kind or grammar rule. We
 * break every venn corpus source in seeded ways and check every message produced.
 */
// v12's `venn.jison` rules and `grammar/venn.ebnf`'s compound ones (`statement`, `document`,
// `line` and `value` are plain words).
const RULES = [
  'optNewlines',
  'identifierList',
  'indentedTextTail',
  'stylesOpt',
  'styleField',
  'styleValue',
  'valueTokens',
  'valueToken',
  'IndentedText',
  'textId',
];
// Token names: jison terminals with `_` or all capitals, and v13 kind names that are compounds
// (`IndentText`, `HexColor`, …); plain words such as `set` are Mermaid syntax.
const TOKENS = [
  ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$/.test(n)),
  ...Object.keys(VennTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
];
const BANNED = new RegExp(`\\b(?:${[...RULES, ...TOKENS].join('|')})\\b`);
/** The author's own text a message quotes: what was found, and the statements a warning names. */
const quoted = (message: string): string =>
  message
    .replace(/got `[\s\S]*?`/g, 'got `…`')
    .replace(/character `[\s\S]*?`/g, 'character `…`')
    .replace(/`[^`]*` at line/g, '`…` at line')
    .replace(/text node `[^`]*`/g, 'text node `…`');

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
        if (BANNED.test(quoted(d.message)) || d.expected?.some((e) => BANNED.test(e))) {
          bad.push(`${JSON.stringify(src)}: ${d.message}`);
        }
      }
    }
    expect(errors).toBeGreaterThan(1000);
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120_000);
});
