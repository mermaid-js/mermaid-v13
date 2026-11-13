import { describe, expect, it } from 'vitest';
import { C4BetaTokenKind, lexC4Beta } from '@mermaid-js/diagram-c4/testing';
import { preprocess } from '@mermaid-js/core/preprocess';
import { c4betaCorpus } from '../corpus.ts';
import { grammarTokens, HIDDEN } from './c4beta-grammar.ts';

/** The shared kinds' grammar names; the diagram's own are the `T` keys in upper snake case. */
const SHARED: Record<number, string> = { 0: 'EOF', 1: 'NEWLINE', 2: 'COMMENT', 5: 'ERROR' };
const NAMES = new Map<number, string>(
  Object.entries(C4BetaTokenKind).map(([key, kind]) => [
    kind,
    key.replace(/[A-Z][a-z0-9]*/g, (w, i: number) => (i ? '_' : '') + w.toUpperCase()),
  ])
);

/** Source lines whose tokens the lexer parity also holds on: the cases below add to the corpus. */
const EXTRA = [
  'c4-beta\n2: a --> 3 : "x"\n  12 : a --> b\n3ds --> a\n',
  'c4-beta\na-->b a<--b a<-->b a---b\n',
  'c4-beta\nperson a "x" :::t-1 :::: :::\n',
  'c4-beta\nstyle a fill:#fff, stroke:#12345, color:#1234567, line:solid\n',
  'c4-beta\ntitle-x a --> b\ntitle a --> b %% c\naccTitle a\naccDescr\naccDescr {\n',
  'c4-beta\nperson a "unclosed\nperson b \'q\\\'s\' "a\\"b"\n',
  'c4-beta\r\npersona\rperson b\n\f',
];

/**
 * The hand-written lexer emits the tokens of the lexer in `grammar/c4beta.ebnf` (names and
 * images), over the corpus and the cases above; on a lexer error both stop at the same offset.
 */
describe('c4-beta grammar lexer', () => {
  it('emits the same tokens as the grammar', () => {
    const diffs: string[] = [];
    const sources = [
      ...c4betaCorpus(),
      ...EXTRA.map((source, k) => ({ id: `extra ${k}`, source })),
    ];
    for (const { id, source } of sources) {
      const ref = grammarTokens(source);
      const pre = preprocess(source);
      const stream = lexC4Beta(
        source,
        pre.bodyStart,
        pre.directives.map((d) => d.range)
      );
      const ours: [string, string][] = [];
      let error: number | undefined;
      for (let j = 0; j < stream.length && error === undefined; j++) {
        const kind = stream.kind[j] ?? 0;
        if (kind === 3) continue;
        const start = stream.start[j] ?? 0;
        if (kind === 5) error = start;
        else
          ours.push([
            SHARED[kind] ?? NAMES.get(kind) ?? `?${kind}`,
            source.slice(start, stream.end[j]),
          ]);
      }
      const theirs = ref.tokens.map((t): [string, string] => [t.name, t.text]);
      const same =
        JSON.stringify([ours, error]) === JSON.stringify([theirs, ref.error]) ||
        // The grammar's `EOF` has no hand-written twin in the text, and a lexer error stops it.
        (error !== undefined &&
          JSON.stringify(ours) === JSON.stringify(theirs) &&
          error === ref.error);
      if (!same) {
        diffs.push(
          `${id}\n  grammar ${JSON.stringify(theirs)} ${ref.error}\n  ours    ${JSON.stringify(ours)} ${error}`
        );
      }
    }
    expect(HIDDEN.has('COMMENT')).toBe(true);
    expect(diffs.slice(0, 10)).toEqual([]);
  });
});
