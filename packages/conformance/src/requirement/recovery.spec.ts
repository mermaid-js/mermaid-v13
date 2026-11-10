// cspell:words verifymethod docref
import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import {
  JISON_NAMES,
  parseRequirement,
  RequirementTokenKind,
} from '@mermaid-js/diagram-requirement';
import { decidedOracle, requirementCases } from './corpus.ts';

/**
 * Recovery set (R-PARSE-4): diagrams with N independent errors give N error diagnostics, each
 * on the line where the error was planted, and the statements around them still reach the
 * model. No message names a token or a grammar rule (R-ERR-5). The sources are
 * `corpus/requirement-cases.json` (`recovery-*`), which every requirement gate also runs
 * (lexer, model and grammar parity); mermaid\@12 with D431's and D432's lexer rules rejects
 * each of them, and each case below that v12 rejects with one error.
 */
interface Expected {
  /** The case id, less `requirement-cases/`. */
  id: string;
  name: string;
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Boxes (requirement or element names) that must still be in the model. */
  keeps?: string[];
  /** Relations (`src->dst`) that must still be in the model. */
  relations?: string[];
}

const RECOVERY: Expected[] = [
  {
    id: 'recovery-a-bad-risk-and-a-bad-method-in-one-body',
    name: 'a bad risk and a bad method in one body',
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['a'],
  },
  {
    id: 'recovery-fields-of-the-other-kind',
    name: 'fields of the other kind',
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 6],
    ],
    keeps: ['a', 'e'],
  },
  {
    id: 'recovery-a-missing-before-the-next-definition',
    name: 'a missing `}` before the next definition',
    errors: [['UNCLOSED_BLOCK', 2]],
    keeps: ['a', 'b'],
    relations: ['a->b'],
  },
  {
    id: 'recovery-a-body-on-the-line-of-its-then-a-good-one',
    name: 'a body on the line of its `{`, then a good one',
    errors: [['UNEXPECTED', 2]],
    keeps: ['a', 'b'],
  },
  {
    id: 'recovery-a-header-without-its-body-on-the-next-lines',
    name: 'a header without `{`, its body on the next lines',
    errors: [['UNEXPECTED', 2]],
    keeps: ['a', 'b'],
  },
  {
    id: 'recovery-a-keyword-as-a-name-twice',
    name: 'a keyword as a name, twice',
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['ok'],
  },
  {
    id: 'recovery-broken-relations-around-a-good-one',
    name: 'broken relations around a good one',
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 5],
    ],
    relations: ['c->d'],
  },
  {
    id: 'recovery-a-lone-and-an',
    name: 'a lone `<-` and an `=`',
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED_CHARACTER', 3],
    ],
    relations: ['c->d'],
  },
  {
    id: 'recovery-styles-with-and-a-tab',
    name: 'styles with `%`, `.` and a tab',
    errors: [
      ['UNEXPECTED', 4],
      ['UNEXPECTED_CHARACTER', 5],
      ['UNEXPECTED_CHARACTER', 6],
    ],
    keeps: ['a'],
  },
  {
    id: 'recovery-a-class-statement-with-one-list-then-a-definition',
    name: 'a class statement with one list, then a definition',
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 5],
    ],
    keeps: ['b'],
  },
  {
    id: 'recovery-title-statements',
    name: 'title statements',
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 5],
    ],
    keeps: ['a'],
  },
  {
    id: 'recovery-stray-and',
    name: 'stray `}` and `{`',
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 5],
    ],
    keeps: ['a'],
  },
  {
    id: 'recovery-text-after-directions',
    name: 'text after directions',
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
    ],
    keeps: ['a'],
  },
  {
    id: 'recovery-empty-quotes-twice',
    name: 'empty quotes, twice',
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['e'],
  },
  {
    id: 'recovery-two-values-in-a-field',
    name: 'two values in a field',
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['a'],
  },
  {
    id: 'recovery-an-unclosed-string-ends-the-text',
    name: 'an unclosed string ends the text',
    errors: [['UNCLOSED_STRING', 4]],
    keeps: ['a'],
  },
  {
    id: 'recovery-an-unclosed-description-ends-the-text',
    name: 'an unclosed description ends the text',
    errors: [['UNCLOSED_DESCRIPTION', 4]],
    keeps: ['a'],
  },
  {
    id: 'recovery-a-missing-title-after-acctitle-at-the-end',
    name: 'a missing title after accTitle at the end',
    errors: [['UNEXPECTED', 4]],
    keeps: ['a'],
  },
  {
    id: 'recovery-statements-on-the-header-line',
    name: 'statements on the header line',
    errors: [['UNEXPECTED', 1]],
    keeps: ['a'],
    relations: ['b->a'],
  },
  {
    id: 'recovery-a-wrong-header',
    name: 'a wrong header',
    errors: [['UNEXPECTED', 1]],
    keeps: ['a'],
  },
  {
    id: 'recovery-an-unknown-character-in-a-body-and-at-the-start-of-a-line',
    name: 'an unknown character in a body and at the start of a line',
    errors: [
      ['UNEXPECTED_CHARACTER', 3],
      ['UNEXPECTED_CHARACTER', 6],
    ],
    keeps: ['a', 'e'],
  },
  {
    id: 'recovery-a-class-shorthand-without-a-class-then-one-with',
    name: 'a class shorthand without a class, then one with',
    errors: [['UNEXPECTED', 4]],
    keeps: ['a'],
  },
  {
    id: 'recovery-a-nested-definition',
    name: 'a nested definition',
    errors: [
      ['UNCLOSED_BLOCK', 2],
      ['UNEXPECTED', 5],
    ],
    keeps: ['a', 'b'],
  },
];

/** What v12 rejects, by case id: the number of errors v13 reports for each. */
const REJECTED: readonly [id: string, errors: number][] = [
  ['body-brace-same-line', 1],
  ['body-cross-kind-field', 2],
  ['keyword-name-test', 1],
  ['keyword-value-high-quality', 1],
  ['string-quoted-empty', 1],
  ['style-percent', 1],
  ['keyword-title', 1],
  ['body-unclosed', 1],
  ['keyword-as-value-number', 1],
];

const SOURCES = new Map(requirementCases().map((c) => [c.id, c.source]));
const source = (id: string): string => {
  const src = SOURCES.get(`requirement-cases/${id}`);
  if (src === undefined) throw new Error(`no case ${id}`);
  return src;
};

describe('requirement recovery', () => {
  it.each(RECOVERY.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const src = source(c.id);
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

  it.each(REJECTED)('%s: %i error(s)', (id, n) => {
    const errors = parseRequirement(source(id)).diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(n);
  });

  it('has at least 20 cases, each one mermaid@12 (with D431 and D432) rejects', async () => {
    expect(RECOVERY.length).toBeGreaterThanOrEqual(20);
    expect(RECOVERY.reduce((n, c) => n + c.errors.length, 0)).toBeGreaterThanOrEqual(35);
    const oracle = await decidedOracle();
    for (const id of [...RECOVERY.map((c) => c.id), ...REJECTED.map(([i]) => i)]) {
      expect((await oracle.parse(source(id))).accepted, id).toBe(false);
    }
  });

  it('never names a token or grammar rule', () => {
    const banned = [
      ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$|^q?[a-z]+[A-Z]/.test(n)),
      ...Object.keys(RequirementTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
      'requirementDef',
      'requirementBody',
      'elementDef',
      'relationshipDef',
      'idList',
      'stylesOpt',
    ];
    const re = new RegExp(`\\b(?:${banned.join('|')})\\b`);
    for (const c of RECOVERY) {
      for (const d of parseRequirement(source(c.id)).diagnostics) {
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
