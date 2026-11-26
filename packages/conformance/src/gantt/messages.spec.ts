import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from '../index.ts';
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

/** D727: a render warns once about unknown ids, in Mermaid terms and with what applies. */
describe('gantt GANTT_UNKNOWN_TASK text', () => {
  const NOW = new Date(2024, 5, 1, 12).getTime();
  const fixture = (name: string): string =>
    readFileSync(join(REPO_ROOT, 'e2e/diagrams/gantt/nightly-check', name), 'utf8');
  async function unknownTask(name: string): Promise<string> {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const { warnings } = await m.render('g', fixture(name), { now: NOW });
    const found = warnings.filter((w) => w.code === 'GANTT_UNKNOWN_TASK');
    expect(found).toHaveLength(1);
    return found[0]!.message;
  }

  it('tells an unknown after only what after does', async () => {
    expect(
      await unknownTask('should-warn-about-unknown-ids-in-an-after-statement-issue-4121.mmd')
    ).toBe('No task has the id "m1" (named by "after"): the task starts at midnight today.');
  });

  it('tells an unknown until only what until does', async () => {
    expect(await unknownTask('should-warn-about-unknown-ids-in-an-until-statement.mmd')).toBe(
      'No task has the id "m1" (named by "until"): the task ends at midnight today.'
    );
  });

  it('adds the milestone hint when the id is the one a milestone wrote as its duration', async () => {
    expect(
      await unknownTask('should-hint-at-a-milestone-id-written-as-its-duration-issue-4121.mmd')
    ).toBe(
      'No task has the id "m1" (named by "after"): the task starts at midnight today. A milestone needs an id and a duration, e.g. "Milestone :milestone, m1, 2023-01-01, 0d".'
    );
  });

  it('calls a click on __proto__ reserved, not unknown', async () => {
    const text = await unknownTask('should-warn-about-a-reserved-id-in-a-click.mmd');
    expect(text).toBe(
      'The id "__proto__" is reserved and cannot be referenced: a click naming it does nothing.'
    );
    expect(text).not.toContain('No task has');
    expect(BANNED.test(text)).toBe(false);
  });
});
