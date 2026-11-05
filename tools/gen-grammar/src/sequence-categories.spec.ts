/**
 * Sequence highlighting (#28, #149): the kind → category table, and the four-way agreement of
 * the table with the generated TextMate, Monarch and Lezer grammars over the sequence corpus,
 * as `categories.spec.ts` checks flowchart.
 */
import { describe, expect, it } from 'vitest';
import { Kind, TOKEN_CATEGORIES } from '@mermaid-js/core/parser-kit';
import {
  detectSequence,
  sequenceCategories,
  SequenceTokenKind as T,
  sequenceTokens,
} from '@mermaid-js/diagram-sequence/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

describe('sequence kind → category table', () => {
  it('gives every sequence and shared kind a highlight category', () => {
    const kinds = [...Object.values(T), ...Object.values(Kind)];
    for (const k of kinds) expect(TOKEN_CATEGORIES, `kind ${k}`).toContain(sequenceCategories[k]);
    expect(Object.keys(sequenceCategories)).toHaveLength(kinds.length);
  });

  it('takes the category from the grammar file’s scopes', () => {
    expect(sequenceCategories[T.SD]).toBe('Keyword');
    expect(sequenceCategories[T.Actor]).toBe('Variable');
    expect(sequenceCategories[T.SolidArrow]).toBe('Operator');
    expect(sequenceCategories[T.Txt]).toBe('String');
    expect(sequenceCategories[T.Num]).toBe('Number');
    expect(sequenceCategories[T.ConfigStart]).toBe('Meta');
    expect(sequenceCategories[Kind.Comment]).toBe('Comment');
  });
});

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  [
    'acc',
    'sequenceDiagram\n  accTitle: t\n  accDescr: d\n  accDescr {\n    multi\n  }\n  A->>B: x',
  ],
  ['legacy-title', 'sequenceDiagram\n  title: Old style\n  A->>B: x'],
  ['title', 'sequenceDiagram\n  title Hello #lt;b#gt;\n  A->>B: x'],
  ['comments', 'sequenceDiagram\n  %% a comment\n  %%{init: {}}%%\n  A->>B: x'],
  ['autonumber-off', 'sequenceDiagram\n  autonumber off\n  A->>B: x'],
  [
    'menus',
    'sequenceDiagram\n  participant A\n  links A: {"x": "y"}\n  link A: Home @ https://x\n  properties A: {"k": "v"}\n  details A: el',
  ],
  [
    'create-destroy',
    'sequenceDiagram\n  create participant B\n  A->>B: x\n  destroy B\n  A->>B: y',
  ],
  ['par-over', 'sequenceDiagram\n  par_over a\n    A->>B: x\n  and b\n    A->>B: y\n  end'],
  [
    'critical-break',
    'sequenceDiagram\n  critical a\n    A->>B: x\n  option b\n    A->>B: y\n  end\n  break c\n    A->>B: z\n  end',
  ],
  ['central', 'sequenceDiagram\n  A->>()B: x\n  A()->>B: y'],
  ['semi', 'sequenceDiagram\n  A->>B: x; B->>A: y'],
  ['data', 'sequenceDiagram\n  participant A@{ "type": "queue" } as Q'],
  ['data-multiline', 'sequenceDiagram\n  participant A@{\n    type: queue\n  } as Q\n  A->>B: x'],
  [
    'alias-then-semi',
    'sequenceDiagram\n  participant A as Alice; A->>B: x as y\n  actor B as Bob; B->>A: ok\n  participant C@{ type: queue }; C->>A: z',
  ],
  ['message-text-as', 'sequenceDiagram\n  A->>B: sent as text\n  participant C'],
  [
    'entities',
    'sequenceDiagram\n  participant A#lt;B\n  A#35;B->>C: x\n  #lt; hi->>C: y\n  activate A#lt;B',
  ],
  ['invalid', 'sequenceDiagram\n  participant A<b>'],
  [
    'half-arrows',
    'sequenceDiagram\n' +
      [
        '-|\\',
        '-|/',
        '-\\\\',
        '-//',
        '/|-',
        '\\|-',
        '//-',
        '\\\\-',
        '--|\\',
        '--|/',
        '--\\\\',
        '--//',
        '/|--',
        '\\|--',
        '//--',
        '\\\\--',
        '<<->>',
        '<<-->>',
        '--x',
        '-)',
        '--)',
        '->',
        '-->',
      ]
        .map((a) => `  A${a}B: x`)
        .join('\n'),
  ],
];

/** Kinds whose tokens are blanks or empty, so no highlighter colours them. */
const BLANK_KINDS = [T.AliasEnd, T.Eof];

describe('four-way highlighting agreement (sequence)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectSequence);
    expect(sources.length).toBeGreaterThan(150);
    const result = agreement(
      { kinds: T, categories: sequenceCategories, tokens: sequenceTokens },
      await highlighters('sequence'),
      [...FIXTURES, ...sources],
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual({});
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
