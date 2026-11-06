import { describe, expect, it } from 'vitest';
import { GanttTokenKind, JISON_NAMES, parseGantt } from '@mermaid-js/diagram-gantt';
import { mutator, random } from '../fuzz/mutator.ts';
import { ganttCases, ganttCorpus } from './corpus.ts';

/**
 * R-ERR-5: messages name constructs in Mermaid terms, never a token kind or grammar rule. We
 * break every gantt corpus source in seeded ways and check every message produced.
 */
// Grammar rules with compound names (`document`, `line`, `statement` are plain words).
const RULES = ['clickStatement', 'clickStatementDebug'];
// Token names: jison terminals with `_` or a capital inside (`taskTxt`), all-capital ones, and
// v13 kind names that are compounds (`TaskText`, `AccDescrValue`, …). Plain words such as
// `title`, and the keywords `dateFormat` or `accTitle` as written, are Mermaid syntax.
const KEYWORDS = new Set([
  'dateFormat',
  'inclusiveEndDates',
  'topAxis',
  'axisFormat',
  'tickInterval',
  'todayMarker',
  'accDescription',
]);
const TOKENS = [
  ...Object.values(JISON_NAMES).filter(
    (n) => (/_|^[A-Z]{2,}$|[a-z][A-Z]/.test(n) && !KEYWORDS.has(n)) || n === 'callbackname'
  ),
  ...Object.keys(GanttTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
];
const BANNED = new RegExp(`\\b(?:${[...RULES, ...TOKENS].join('|')})\\b`);

const FRAGMENTS = [':', ': ', '::', '#', '%', '%%', '%%{', '\n', ';', ',', '{', '}', '"', '(', ')'];
const FRAGMENTS_MORE = [
  'gantt',
  'title',
  'section',
  'accTitle:',
  'accDescr {',
  'click a',
  ' href "',
  ' call f(',
  'done,',
  '2024-01-01',
  'topAxis',
];

describe('gantt error messages', () => {
  it('never name a token or grammar rule', async () => {
    const corpus = [...(await ganttCorpus()), ...ganttCases()].map((c) => c.source);
    const next = mutator(corpus, [...FRAGMENTS, ...FRAGMENTS_MORE], random(293));
    const bad: string[] = [];
    let errors = 0;
    for (let i = 0; i < 5000; i++) {
      const src = next();
      for (const d of parseGantt(src).diagnostics) {
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
