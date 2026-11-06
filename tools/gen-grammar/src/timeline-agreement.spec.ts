/**
 * Timeline highlighting (#318, language.md step 3): the four-way agreement of the kind →
 * category table with the generated TextMate, Monarch and Lezer grammars over the timeline
 * corpus, as `er-agreement.spec.ts` checks ER.
 */
import { describe, expect, it } from 'vitest';
import {
  detectTimeline,
  timelineCategories,
  TimelineTokenKind as T,
  timelineTokens,
} from '@mermaid-js/diagram-timeline/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  ['headers', 'timeline TD\n  2002 : x'],
  ['acc', 'timeline LR\n  accTitle: Pets\n  accDescr: one line\n  accDescr {\n    multi\n  }\n'],
  ['empty block', 'timeline\n  accDescr {}\n  2002 : x'],
  ['comments', 'timeline\n  %% a comment\n  %%{init: {}}%%\n  2002 : a # hash\n  # line\n'],
  ['multi-line directive', 'timeline\n  %%{\n    init: {}\n  }%%\n  2002 : a'],
  ['invalid', 'timeline\n  2002 :x\n  title T\n  section S : a : b'],
];

/** Kinds whose tokens are blanks or empty, so no highlighter colours them. */
const BLANK_KINDS: number[] = [T.Eof];

describe('four-way highlighting agreement (timeline)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectTimeline);
    expect(sources.length).toBeGreaterThan(20);
    const result = agreement(
      { kinds: T, categories: timelineCategories, tokens: timelineTokens },
      await highlighters('timeline'),
      [...FIXTURES, ...sources],
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual({});
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
