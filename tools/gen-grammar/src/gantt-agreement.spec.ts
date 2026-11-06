/**
 * Gantt highlighting (#382, language.md step 3): the four-way agreement of the kind → category
 * table with the generated TextMate, Monarch and Lezer grammars over the gantt corpus, as
 * `timeline-agreement.spec.ts` checks timeline.
 */
import { describe, expect, it } from 'vitest';
import {
  detectGantt,
  ganttCategories,
  GanttTokenKind as T,
  ganttTokens,
} from '@mermaid-js/diagram-gantt/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  [
    'settings',
    'gantt\n  dateFormat YYYY-MM-DD\n  axisFormat %d\n  tickInterval 1week\n  includes 2024-01-06\n' +
      '  excludes weekends\n  todayMarker off\n  inclusiveEndDates\n  topAxis\n',
  ],
  [
    'weekdays',
    'gantt\n  weekday monday\n  weekday tuesday\n  weekday wednesday\n  weekday thursday\n' +
      '  weekday friday\n  weekday saturday\n  weekday sunday\n  weekend friday\n  weekend saturday\n',
  ],
  ['acc', 'gantt\n  accTitle: Plan\n  accDescr: one line\n  accDescr {\n    multi\n  }\n'],
  ['empty block', 'gantt\n  accDescr {}\n  a :1d'],
  [
    'clicks',
    'gantt\n  a :a1, 2024-01-01, 1d\n  click a1 href "https://x.org" call f(a, b)\n  click a1 call g()\n',
  ],
  ['comments', 'gantt\n  %% a comment\n  %%{init: {}}%%\n  a :1d # hash\n'],
  ['invalid', 'gantt\n  2024-01-01 x :1d\n  accDescription foo\n  a :\n  b :1d'],
  // jison throws after `%%{`; the highlighters agree only when nothing follows it.
  ['open directive', 'gantt\n  a :1d\n  %%{'],
];

/** Kinds whose tokens are blanks or empty, so no highlighter colours them. */
const BLANK_KINDS: number[] = [T.Eof, T.ClickEnd];

describe('four-way highlighting agreement (gantt)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectGantt);
    expect(sources.length).toBeGreaterThan(40);
    const result = agreement(
      { kinds: T, categories: ganttCategories, tokens: ganttTokens },
      await highlighters('gantt'),
      [...FIXTURES, ...sources],
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual({});
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
