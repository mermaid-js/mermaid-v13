/**
 * C4 highlighting (#543, language.md step 3): the four-way agreement of the kind → category
 * table with the generated TextMate, Monarch and Lezer grammars over the c4 corpus, as
 * `kanban-agreement.spec.ts` checks kanban.
 *
 * Known gap (GAPS #543, for gen-grammar): TextMate goes wrong after a `$name="value"`. The
 * name, the `="` and the value each take the place of the one before on the mode stack (a
 * pop-then-push chain); TextMate's chain scope tries its links again where the chain returns
 * before it ends, and the name's `[^=]*` matches there, so the rest of the line, and the lines
 * after it, stay in the name. TextMate is checked over the sources with no named argument;
 * Monarch and Lezer (the editor adapters' highlighters) over all of them.
 */
import { describe, expect, it } from 'vitest';
import {
  C4TokenKind as T,
  c4Categories,
  c4Tokens,
  detectC4,
} from '@mermaid-js/diagram-c4/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  ['headers', 'C4Component\nComponent(a, "A")\n'],
  [
    'queues',
    'C4Context\nSystemQueue_Ext(q, "Q")\nContainerQueue_Ext(c, "C")\nComponentQueue_Ext(d, "D")\nComponentDb_Ext(e, "E")\n',
  ],
  ['empty arguments', 'C4Context\nPerson(, "A")\nPerson(a,,"A")\nPerson(b, "")\n'],
  [
    'accessibility',
    'C4Context\naccTitle: Title\naccDescr: One line\naccDescr {\n  More lines\n}\naccDescription The description\nPerson(a, "A")\n',
  ],
  ['rel index', 'C4Dynamic\nPerson(a, "A")\nRelIndex(1, a, a, "Self")\n'],
  ['lone title', 'C4Context\ntitle\nPerson(a, "A")\n'],
  [
    'directions',
    'C4Context\ndirection TB\ndirection BT\ndirection RL\ndirection LR\nPerson(a, "A")\n',
  ],
  ['comments', 'C4Context\n%% a comment\n%%{init: {}}%%\nPerson(a, "A") %% kept\n'],
  ['nodes', 'C4Deployment\nNode_L(l, "L") {\n  Node_R(r, "R") {\n    Container(c, "C")\n  }\n}\n'],
  ['named', 'C4Context\nPerson(a, "A", $sprite="x")\nPerson(b, "B")\n'],
];

/** Kinds whose tokens are blanks or empty, so no highlighter colours them. */
const BLANK_KINDS: number[] = [T.Eof, T.EofInStruct];

describe('four-way highlighting agreement (c4)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = [...FIXTURES, ...corpus(detectC4)];
    expect(sources.length).toBeGreaterThan(40);
    const type = { kinds: T, categories: c4Categories, tokens: c4Tokens };
    const all = await highlighters('c4');
    const editors = all.filter(([name]) => name !== 'TextMate');
    const result = agreement(type, editors, sources, BLANK_KINDS);
    expect(result.disagreements).toEqual({});
    expect(result.missing, 'kinds with no sample').toEqual([]);
    const plain = sources.filter(([, src]) => !src.includes('$'));
    expect(plain.length).toBeGreaterThan(20);
    const textMate = all.filter(([name]) => name === 'TextMate');
    expect(agreement(type, textMate, plain, BLANK_KINDS).disagreements).toEqual({});
  }, 120_000);
});
