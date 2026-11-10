// cspell:words verifymethod docref
import { describe, expect, it } from 'vitest';
import {
  JISON_NAMES,
  parseRequirement,
  RequirementTokenKind,
} from '@mermaid-js/diagram-requirement';
import { mutator, random } from '../fuzz/mutator.ts';
import { requirementCases, requirementCorpus } from './corpus.ts';

/**
 * R-ERR-5: messages name constructs in Mermaid terms, never a token kind or grammar rule. We
 * break every requirement corpus source in seeded ways and check every message produced.
 */
// v12's rules (`requirementDef`, `idList`, …) and their camel-case peers.
const RULES = [
  'requirementDef',
  'requirementBody',
  'requirementType',
  'requirementName',
  'elementDef',
  'elementBody',
  'elementName',
  'relationshipDef',
  'classDefStatement',
  'classStatement',
  'styleStatement',
  'styleComponent',
  'stylesOpt',
  'idList',
  'riskLevel',
  'verifyType',
];
// Token names: jison terminals with `_`, all capitals or a lower-case start and a capital
// (`qString`), and v13 kind names that are compounds (`StructStart`).
const TOKENS = [
  ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$|^[a-z]+[A-Z]/.test(n)),
  ...Object.keys(RequirementTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
];
const BANNED = new RegExp(`\\b(?:${[...RULES, ...TOKENS].join('|')})\\b`);
/**
 * The author's own text a message quotes: a name or value, what was found, a keyword it read,
 * and its quoted form in the hint.
 */
const quoted = (message: string): string =>
  message
    .replace(/"[\s\S]*?"/g, '""')
    .replace(/(got|Unexpected|character|after) `[\s\S]*?`/g, '$1 ``')
    .replace(/`[^`]*` is a keyword/g, '`` is a keyword')
    .replace(/e\.g\. `"[^`]*"`/g, 'e.g. ``');

const FRAGMENTS = ['{', '}', '"', '""', '\n', '\r\n', ' ', '  \n', ':', ':::', ',', '-', '->'];
const FRAGMENTS_MORE = [
  '<-',
  '%%',
  '%% c\n',
  '\t',
  'é',
  '#9829;',
  'requirement x {',
  'element',
  'risk: high',
  'direction LR',
  'style a fill:red',
  'title x',
  'accDescr {',
  '%',
];

describe('requirement error messages', () => {
  it('never name a token or grammar rule', async () => {
    const corpus = [...(await requirementCorpus()), ...requirementCases()].map((c) => c.source);
    const next = mutator(corpus, [...FRAGMENTS, ...FRAGMENTS_MORE], random(520));
    const bad: string[] = [];
    let errors = 0;
    for (let i = 0; i < 5000; i++) {
      const src = next();
      for (const d of parseRequirement(src).diagnostics) {
        if (d.severity === 'error') errors++;
        const texts = [d.message, ...(d.related ?? []).map((r) => r.message)];
        if (
          texts.some((t) => BANNED.test(quoted(t))) ||
          d.expected?.some((e) => BANNED.test(quoted(e)))
        ) {
          bad.push(`${JSON.stringify(src)}: ${d.message}`);
        }
      }
    }
    expect(errors).toBeGreaterThan(1000);
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120_000);
});
