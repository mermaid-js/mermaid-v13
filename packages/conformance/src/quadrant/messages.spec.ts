import { describe, expect, it } from 'vitest';
import { JISON_NAMES, parseQuadrant, QuadrantTokenKind } from '@mermaid-js/diagram-quadrant';
import { mutator, random } from '../fuzz/mutator.ts';
import { quadrantCases, quadrantCorpus } from './corpus.ts';

/**
 * R-ERR-5: messages name constructs in Mermaid terms, never a token kind or grammar rule, and
 * quote at most one line. We break every quadrant corpus source in seeded ways and check every
 * message produced.
 */
const RULES = [
  'textNoTagsToken',
  'alphaNumToken',
  'idStringToken',
  'idString',
  'stylesOpt',
  'styleComponent',
  'classDefStatement',
  'axisDetails',
  'quadrantDetails',
];
// Token names: jison terminals with `_`, `-` or all capitals, and v13 kind names that are
// compounds (`PointStart`, …); plain words such as `title` are Mermaid syntax.
const TOKENS = [
  ...Object.values(JISON_NAMES).filter((n) => /_|-|^[A-Z]{2,}$/.test(n)),
  ...Object.keys(QuadrantTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
];
const BANNED = new RegExp(`\\b(?:${[...RULES, ...TOKENS].join('|')})\\b`);

const LEXER_CASE = /^quadrant-cases\/(db styles|lexer case|line separators) /;

const FRAGMENTS = [':', ':::', '[', ']', ',', '"', '"`', '`"', '\n', ';', '-->', '(', '{', '}'];
const FRAGMENTS_MORE = ['x-axis', 'quadrant-1', 'classDef x', 'title', 'accDescr {', '2', '0.5'];

describe('quadrant error messages', () => {
  it('never name a token or grammar rule', async () => {
    // Seeded with the corpus and the parser cases; the lexer gate's cases (style lists, lexer and
    // line-separator cases) stay out.
    const parserCases = quadrantCases().filter((c) => !LEXER_CASE.test(c.id));
    const corpus = [...(await quadrantCorpus()), ...parserCases].map((c) => c.source);
    const next = mutator(corpus, [...FRAGMENTS, ...FRAGMENTS_MORE], random(289));
    const bad: string[] = [];
    let errors = 0;
    for (let i = 0; i < 5000; i++) {
      const src = next();
      for (const d of parseQuadrant(src).diagnostics) {
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
