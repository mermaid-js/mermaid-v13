import { describe, expect, it } from 'vitest';
import { ClassTokenKind, JISON_NAMES, parseClass } from '@mermaid-js/diagram-class';
import { classCorpus } from './grammar/corpus.ts';

/**
 * R-ERR-5: messages name constructs in Mermaid terms, never a token kind or grammar rule. We
 * break every class corpus source in seeded ways and check every message produced.
 */
const RULES = [
  'mermaidDoc',
  'graphConfig',
  'statements',
  'classLabel',
  'namespaceName',
  'className',
  'namespaceStatement',
  'namespaceIdentifier',
  'classStatements',
  'classStatement',
  'classIdentifier',
  'emptyBody',
  'annotationStatement',
  'memberStatement',
  'relationStatement',
  'noteStatement',
  'classDefStatement',
  'classList',
  'relationType',
  'lineType',
  'clickStatement',
  'styleStatement',
  'cssClassStatement',
  'stylesOpt',
  'styleComponent',
  'alphaNumToken',
  'classLiteralName',
  'noteText',
];
// Token names: jison terminals with an underscore or two capitals, and v13 kind names that
// are compounds (`StructStart`, …); plain words such as `class` are Mermaid syntax.
const TOKENS = [
  ...Object.values(JISON_NAMES).filter((n) => /_|[A-Z].*[A-Z]/.test(n)),
  ...Object.keys(ClassTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
];
const BANNED = new RegExp(`\\b(?:${[...RULES, ...TOKENS].join('|')})\\b`);

const BREAKS = [
  '{',
  '}',
  '"',
  '~',
  '`',
  ':',
  ':::',
  '<<',
  '>>',
  '-->',
  '->',
  '(',
  ';',
  '\n',
  '[',
  'class ',
];

describe('class diagnostics', () => {
  it('never name a token kind or grammar rule', async () => {
    let seed = 42;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const bad: string[] = [];
    let messages = 0;
    for (const item of await classCorpus()) {
      for (let k = 0; k < 3; k++) {
        const at = rnd(item.source.length + 1);
        const src =
          item.source.slice(0, at) + (BREAKS[rnd(BREAKS.length)] ?? '') + item.source.slice(at);
        for (const d of parseClass(src).diagnostics) {
          messages++;
          if (BANNED.test(d.message)) bad.push(`${item.id}: ${d.message}`);
          for (const e of d.expected ?? []) if (BANNED.test(e)) bad.push(`${item.id}: ${e}`);
        }
      }
    }
    expect(messages).toBeGreaterThan(500);
    expect(bad).toEqual([]);
  }, 60_000);
});
