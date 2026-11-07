/**
 * Packet highlighting (#458, language.md step 3): the four-way agreement of the kind → category
 * table with the generated TextMate, Monarch and Lezer grammars over the packet corpus, as
 * `pie-agreement.spec.ts` checks pie.
 */
import { describe, expect, it } from 'vitest';
import {
  detectPacket,
  packetCategories,
  PacketTokenKind as T,
  packetTokens,
} from '@mermaid-js/diagram-packet/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/**
 * Where TextMate and Monarch, which read a line at a time, cannot follow two tokens that run
 * over line breaks (Lezer, which runs the patterns, agrees): a label written over lines, and a
 * `---` … `---` block inside the body (v12's skipped YAML token; its optional middle cannot be
 * written as one `begin[\s\S]*?end` span). The corpus has neither, only these fixtures do. The
 * block `accDescr { … }` is written as a span and agrees.
 */
const LINE_BASED = Object.fromEntries(
  ['Monarch', 'TextMate'].flatMap((h) => [
    [`${h}: String is String, highlighted Other`, 'multi-line label at 14'],
    [`${h}: Yaml is Meta, highlighted Number`, 'yaml in the body at 14'],
    [`${h}: Yaml is Meta, highlighted Other`, 'yaml in the body at 11'],
    [`${h}: Yaml is Meta, highlighted Punctuation`, 'yaml in the body at 7'],
  ])
);

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  ['acc', 'packet\n  accTitle: TCP\n  accDescr: one line\n  accDescr {\n    multi\n  }\n'],
  ['fields', `packet-beta\n  0-15: 'Source Port'\n  +16: "a\\"b"\n  32: "Flag"`],
  ['comments', 'packet\n  %% a comment\n  %%{init: {}}%%\n  0-7: "a" %% after\n'],
  ['multi-line directive', 'packet\n  %%{\n    init: {}\n  }%%\n  0-7: "a"'],
  ['title', 'packet title TCP %% c\n  title  Two  words'],
  ['multi-line label', 'packet\n  0-7: "multi\nline"\n  8: "b"'],
  ['yaml in the body', 'packet\n---\nx: 1\n---\n  0-7: "a"'],
];

describe('four-way highlighting agreement (packet)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectPacket);
    expect(sources.length).toBeGreaterThan(5);
    const result = agreement(
      { kinds: T, categories: packetCategories, tokens: packetTokens },
      await highlighters('packet'),
      [...FIXTURES, ...sources]
    );
    expect(result.disagreements).toEqual(LINE_BASED);
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
