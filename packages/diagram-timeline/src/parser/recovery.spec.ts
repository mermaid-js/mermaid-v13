import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseTimeline } from '../index.ts';
import { JISON_NAMES, T } from './tokens.ts';

/**
 * Recovery set (R-PARSE-4): timelines with N independent errors give N error diagnostics, each
 * on the line where the error was planted, and the statements around them still reach the
 * model. No message names a token or a grammar rule (R-ERR-5).
 */
interface Case {
  name: string;
  lines: string[];
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Period, event and section texts (trimmed) that must still be in the model. */
  keeps?: string[];
}

const CASES: Case[] = [
  {
    name: 'colons that start no event',
    lines: ['timeline', '2002 :x', '2003 : ok', '2004 : ', '2005 : fine'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['2003', 'ok', '2005', 'fine'],
  },
  {
    name: 'an event before any period, then a bad colon',
    lines: ['timeline', ': early', '2002 : a', 'section S', '2003 :b : c', '2004 : d'],
    errors: [
      ['TIMELINE_EVENT_BEFORE_PERIOD', 2],
      ['UNEXPECTED', 5],
    ],
    keeps: ['2002', 'a', 'S', '2004', 'd'],
  },
  {
    name: 'a second header, twice',
    lines: ['timeline TD', '2002 : a', 'timeline', '2003 : b', 'timeline LR : c', '2004 : d'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 5],
    ],
    keeps: ['2002', '2003', 'b', '2004', 'd'],
  },
  {
    name: 'no header, and an unclosed description',
    lines: ['2002 : a', '2003 : b', 'accDescr {', '  never closed'],
    errors: [
      ['UNEXPECTED', 1],
      ['UNCLOSED_DESCRIPTION', 3],
    ],
    keeps: ['2003', 'b'],
  },
  {
    name: 'a bad colon, then an empty accTitle at the end',
    lines: ['timeline', 'section A', '2002 :a', '2003 : b', 'accTitle: '],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 5],
    ],
    keeps: ['A', '2003', 'b'],
  },
  {
    name: 'an unclosed description that recovery skips',
    lines: ['timeline', '2002 ::accDescr { never closed'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNCLOSED_DESCRIPTION', 2],
    ],
  },
  {
    name: 'a bare section that takes the next line, then a stray colon',
    lines: ['timeline', 'section', '2002 : a', '2003 : b', '2004 :: c'],
    errors: [
      ['TIMELINE_EVENT_BEFORE_PERIOD', 3],
      ['UNEXPECTED', 5],
    ],
    keeps: ['2002', '2003', 'b'],
  },
];

// Token names: jison terminals with `_` or all capitals, and v13 kind names that are compounds.
const TOKENS = [
  ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$/.test(n)),
  ...Object.keys(T).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
];
const BANNED = new RegExp(`\\b(?:${TOKENS.join('|')}|timeline_header|period_statement)\\b`);

describe('timeline recovery set', () => {
  it.each(CASES)('$name', ({ lines, errors, keeps = [] }) => {
    const src = lines.join('\n');
    const { model, diagnostics } = parseTimeline(src);
    const index = new LineIndex(src);
    const got = diagnostics
      .filter((d) => d.severity === 'error')
      .map((d): [string, number] => [d.code, index.position(d.range.start).line + 1]);
    expect(got).toEqual(errors);
    for (const d of diagnostics) expect(d.message).not.toMatch(BANNED);
    const texts = [
      ...model.sections.map((s) => s.text.trim()),
      ...model.periods.flatMap((p) => [p.text.trim(), ...p.events.map((e) => e.text.trim())]),
    ];
    for (const k of keeps) expect(texts).toContain(k);
  });

  it('gives 14 errors over the set', () => {
    expect(CASES.flatMap((c) => c.errors)).toHaveLength(14);
  });
});
