// cspell:words verifymethod docref
import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseRequirement } from '../index.ts';
import { JISON_NAMES, T } from './tokens.ts';

/**
 * Recovery set (R-PARSE-4): diagrams with N independent errors give N error diagnostics, each
 * on the line where the error was planted, and the statements around them still reach the
 * model. No message names a token or a grammar rule (R-ERR-5).
 */
interface Case {
  name: string;
  lines: string[];
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Boxes (requirement or element names) that must still be in the model. */
  keeps?: string[];
  /** Relations (`src->dst`) that must still be in the model. */
  relations?: string[];
}

const U = 'UNEXPECTED';
const H = 'requirementDiagram';
const CASES: Case[] = [
  {
    name: 'a bad risk and a bad method in one body',
    lines: [H, 'requirement a {', '  risk: extreme', '  verifymethod: guess', '  id: 1', '}'],
    errors: [
      [U, 3],
      [U, 4],
    ],
    keeps: ['a'],
  },
  {
    name: 'fields of the other kind',
    lines: [H, 'requirement a {', '  type: t', '}', 'element e {', '  risk: low', '}'],
    errors: [
      [U, 3],
      [U, 6],
    ],
    keeps: ['a', 'e'],
  },
  {
    name: 'a missing `}` before the next definition',
    lines: [H, 'requirement a {', '  id: 1', 'element b {', '}', 'a - traces -> b'],
    errors: [['UNCLOSED_BLOCK', 2]],
    keeps: ['a', 'b'],
    relations: ['a->b'],
  },
  {
    name: 'a body on the line of its `{`, then a good one',
    lines: [H, 'requirement a { }', 'requirement b {', '}'],
    errors: [[U, 2]],
    keeps: ['a', 'b'],
  },
  {
    name: 'a header without `{`, its body on the next lines',
    lines: [H, 'requirement "a" x', '{', '  id: 1', '}', 'requirement b {', '}'],
    errors: [[U, 2]],
    keeps: ['a', 'b'],
  },
  {
    name: 'a keyword as a name, twice',
    lines: [H, 'element test {', '}', 'a - traces -> element', 'requirement ok {', '}'],
    errors: [
      [U, 2],
      [U, 4],
    ],
    keeps: ['ok'],
  },
  {
    name: 'broken relations around a good one',
    lines: [H, 'a - traces ->', 'a - foo -> b', 'c - copies -> d', 'e <- copies -> f'],
    errors: [
      [U, 2],
      [U, 3],
      [U, 5],
    ],
    relations: ['c->d'],
  },
  {
    name: 'a lone `<-` and an `=`',
    lines: [H, 'a<-b', 'x=y', 'c - traces -> d'],
    errors: [
      [U, 2],
      ['UNEXPECTED_CHARACTER', 3],
    ],
    relations: ['c->d'],
  },
  {
    name: 'styles with `%`, `.` and a tab',
    lines: [
      H,
      'requirement a {',
      '}',
      'style a fill:50%',
      'style a fill:a.b',
      'style a fill:\tred',
      'style a stroke:#333',
    ],
    errors: [
      [U, 4],
      ['UNEXPECTED_CHARACTER', 5],
      ['UNEXPECTED_CHARACTER', 6],
    ],
    keeps: ['a'],
  },
  {
    name: 'a class statement with one list, then a definition',
    lines: [H, 'class a', 'requirement b {', '}', 'class b'],
    errors: [
      [U, 3],
      [U, 5],
    ],
    keeps: ['b'],
  },
  {
    name: 'title statements',
    lines: [H, 'title x', 'requirement a {', '}', 'title y'],
    errors: [
      [U, 2],
      [U, 5],
    ],
    keeps: ['a'],
  },
  {
    name: 'stray `}` and `{`',
    lines: [H, '}', 'requirement a {', '}', '{'],
    errors: [
      [U, 2],
      [U, 5],
    ],
    keeps: ['a'],
  },
  {
    name: 'text after directions',
    lines: [H, 'direction LR a - traces -> b', 'direction TB;', 'requirement a {', '}'],
    errors: [
      [U, 2],
      [U, 3],
    ],
    keeps: ['a'],
  },
  {
    name: 'empty quotes, twice',
    lines: [H, 'requirement "" {', '}', '"" - traces -> a', 'element e {', '}'],
    errors: [
      [U, 2],
      [U, 4],
    ],
    keeps: ['e'],
  },
  {
    name: 'two values in a field',
    lines: [H, 'requirement a {', '  id: 1, 2', '  text: "x" y', '  risk: low', '}'],
    errors: [
      [U, 3],
      [U, 4],
    ],
    keeps: ['a'],
  },
  {
    name: 'an unclosed string ends the text',
    lines: [H, 'requirement a {', '}', 'requirement "b {', '}'],
    errors: [['UNCLOSED_STRING', 4]],
    keeps: ['a'],
  },
  {
    name: 'an unclosed description ends the text',
    lines: [H, 'requirement a {', '}', 'accDescr {', '  text'],
    errors: [['UNCLOSED_DESCRIPTION', 4]],
    keeps: ['a'],
  },
  {
    name: 'a missing title after accTitle at the end',
    lines: [H, 'requirement a {', '}', 'accTitle:'],
    errors: [[U, 4]],
    keeps: ['a'],
  },
  {
    name: 'statements on the header line',
    lines: [`${H} requirement a {`, '}', 'b - traces -> a'],
    errors: [[U, 1]],
    keeps: ['a'],
    relations: ['b->a'],
  },
  {
    name: 'a wrong header',
    lines: ['requirementDiagramx', 'requirement a {', '}'],
    errors: [[U, 1]],
    keeps: ['a'],
  },
  {
    name: 'an unknown character in a body and at the start of a line',
    lines: [H, 'requirement a {', '  @id: 1', '  id: 2', '}', '😀', 'element e {', '}'],
    errors: [
      ['UNEXPECTED_CHARACTER', 3],
      ['UNEXPECTED_CHARACTER', 6],
    ],
    keeps: ['a', 'e'],
  },
  {
    name: 'a class shorthand without a class, then one with',
    lines: [H, 'requirement a {', '}', 'a:::', 'a:::c'],
    errors: [[U, 4]],
    keeps: ['a'],
  },
  {
    name: 'a nested definition',
    lines: [H, 'requirement a {', '  requirement b {', '  }', '}'],
    errors: [
      ['UNCLOSED_BLOCK', 2],
      [U, 5],
    ],
    keeps: ['a', 'b'],
  },
];

const linesOf = (c: Case) => c.lines.join('\n');

describe('requirement recovery', () => {
  it.each(CASES.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const src = linesOf(c);
    const r = parseRequirement(src);
    const lines = new LineIndex(src);
    const got = r.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d): [string, number] => [d.code, lines.position(d.range.start).line + 1]);
    expect(got).toEqual(c.errors);
    const boxes = [...r.model.requirements, ...r.model.elements].map((b) => b.name);
    for (const name of c.keeps ?? []) expect(boxes, name).toContain(name);
    const relations = r.model.relations.map((x) => `${x.src}->${x.dst}`);
    for (const rel of c.relations ?? []) expect(relations, rel).toContain(rel);
  });

  it('has at least 20 cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(CASES.reduce((n, c) => n + c.errors.length, 0)).toBeGreaterThanOrEqual(35);
  });

  it('never names a token or grammar rule', () => {
    const banned = [
      ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$|^q?[a-z]+[A-Z]/.test(n)),
      ...Object.keys(T).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
      'requirementDef',
      'requirementBody',
      'elementDef',
      'relationshipDef',
      'idList',
      'stylesOpt',
    ];
    const re = new RegExp(`\\b(?:${banned.join('|')})\\b`);
    for (const c of CASES) {
      for (const d of parseRequirement(linesOf(c)).diagnostics) {
        const texts = [
          d.message,
          ...(d.related ?? []).map((x) => x.message),
          ...(d.expected ?? []),
        ];
        for (const t of texts) {
          expect(re.test(t.replace(/`[^`]*`/g, '``')), `${c.name}: ${t}`).toBe(false);
        }
      }
    }
  });
});
