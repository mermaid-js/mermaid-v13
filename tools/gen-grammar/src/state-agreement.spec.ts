/**
 * State highlighting (#28, #190): the four-way agreement of the kind → category table with the
 * generated TextMate, Monarch and Lezer grammars over the state corpus, as
 * `categories.spec.ts` checks flowchart. The table itself: `state-categories.spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  detectState,
  stateCategories,
  StateTokenKind as T,
  stateTokens,
} from '@mermaid-js/diagram-state/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/** Sources for the kinds the corpus lacks (and the regressions it found). */
const FIXTURES: [string, string][] = [
  ['href', 'stateDiagram-v2\n  click A href "http://x"'],
  ['default', 'stateDiagram-v2\n  default\n  A --> default'],
  ['scale', 'stateDiagram-v2\n  scale 200 width\n  A'],
  ['acc-descr', 'stateDiagram-v2\n  accDescr {\n    multi\n  }\n  A'],
  ['class-def-default', 'stateDiagram-v2\n  classDef default fill:#f00'],
  ['multi-word-state', 'stateDiagram-v2\n  state a b {\n  }'],
  ['hide-empty', 'stateDiagram-v2\n  hide empty description\n  A'],
  ['invalid', 'stateDiagram-v2\n  A --> B\n  -'],
  // A note over lines ends at `end note` on a line of its own (line-based highlighters).
  ['note', 'stateDiagram-v2\n  note left of A\n    two\n    lines\n  end note\n  A --> B'],
  // An entity's `;` does not end a description.
  ['entity', 'stateDiagram-v2\n  A --> B: x#colon; y\n  B --> C'],
  // A `;` ends a note's text: it and what follows are state ids, and the line after is read
  // again (#1356: TextMate's chain opened the note's id and text again at the `;`).
  ['note-semicolon', 'stateDiagram-v2\n  note right of A : raw &lt; x\n  B --> C'],
  ['multi-line directive', 'stateDiagram-v2\n  %%{\n    init: {}\n  }%%\n  A --> B'],
];

/** Kinds whose tokens are blanks or empty, so no highlighter colours them. */
const BLANK_KINDS: number[] = [T.EndOfInput];

describe('four-way highlighting agreement (state)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectState);
    expect(sources.length).toBeGreaterThan(100);
    const result = agreement(
      { kinds: T, categories: stateCategories, tokens: stateTokens },
      await highlighters('state'),
      [...FIXTURES, ...sources],
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual({});
    // Embedded diagram blocks (ADR-15) are left out of the corpus: the generated grammars list
    // their tokens for the category table only and never enter the block mode (#671).
    const missing = result.missing.filter((k) => !k.startsWith('Embed'));
    expect(missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
