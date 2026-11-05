/**
 * User journey highlighting (#331, language.md step 3): the four-way agreement of the kind →
 * category table with the generated TextMate, Monarch and Lezer grammars over the journey
 * corpus, as `er-agreement.spec.ts` checks ER.
 */
import { describe, expect, it } from 'vitest';
import {
  detectJourney,
  journeyCategories,
  JourneyTokenKind as T,
  journeyTokens,
} from '@mermaid-js/diagram-journey/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  ['acc', 'journey\n  accTitle: A day\n  accDescr: one line\n  accDescr {\n    multi\n  }\n'],
  ['colon', 'journey\n  section A\n  Make tea:\n  T: 5: Me'],
  ['invalid', 'journey\n  T: 5; U: 3'],
  ['comments', 'journey\n  %% a comment\n  %%{init: {}}%%\n  T: 5: Me # c\n'],
  ['multi-line directive', 'journey\n  %%{\n    init: {}\n  }%%\n  T: 5'],
  ['title', 'journey\n  title My day: at work\n  section Go to work\n  Make tea: 5: Me, Cat'],
];

/** Kinds whose tokens are empty, so no highlighter colours them. */
const BLANK_KINDS: number[] = [T.Eof];

describe('four-way highlighting agreement (journey)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectJourney);
    expect(sources.length).toBeGreaterThan(10);
    const result = agreement(
      { kinds: T, categories: journeyCategories, tokens: journeyTokens },
      await highlighters('journey'),
      [...FIXTURES, ...sources],
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual({});
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
