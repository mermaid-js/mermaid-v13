import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JISON_NAMES, stateTokens } from '@mermaid-js/diagram-state';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';
import { loadStateLexerOracle } from './jison-lexer.ts';
import type { JisonToken } from './jison-lexer.ts';

/**
 * Lexer-parity gate (#138, parser-method §1): the v13 state lexer emits the same terminals,
 * with the same images, as mermaid v12's `stateDiagram.jison` lexer on the text v12 lexed.
 * Corpus: the e2e fixtures of both keywords (D104), the strings harvested from v12's state
 * specs and syntax page (`corpus/state-v12-specs.json`), the edge cases below, and every one of
 * those again with comment lines added (v12 removed them before lexing).
 *
 * Normalisation, both sides:
 * - v12's entity placeholders are decoded back to the source form `#name;` (v13 lexes the
 *   source, and treats each `#name;` as one opaque unit, as v12 lexed its placeholder);
 * - v12 appended a `\n` before lexing; v13 lexes a sentinel line break there whose image is
 *   clipped to the source, and the oracle takes it off the image of the v12 token whose match
 *   ended there.
 *
 * Exclusions (each one a token jison does not return, so there is nothing to compare):
 * - v13 also emits tokens for text jison consumes without a token: the `state` keyword, the
 *   `accDescr {` opener and its `}`, the quotes around state descriptions and floating notes,
 *   the `<<fork>>`-style markers, `width` after `scale N`, and comments (trivia). They have no
 *   entry in `JISON_NAMES` and are left out.
 * - Empty-image tokens are not excluded: v13 emits them where jison does (an empty value at a
 *   line or text end, the closing `NL` of the input).
 * - After a lexical error jison stops (no rule matched, or the "single word" rule threw); both
 *   streams are cut at the first `ERROR`. jison's `INVALID` (its `.` rule) is a normal token.
 */
function v12Image(image: string): string {
  return image.replace(/ﬂ°°|ﬂ°/g, '#').replace(/¶ß/g, ';');
}

function cut(tokens: JisonToken[]): JisonToken[] {
  const i = tokens.findIndex(([name]) => name === 'ERROR');
  return i < 0 ? tokens : [...tokens.slice(0, i), ['ERROR', '']];
}

function v13Tokens(source: string): JisonToken[] {
  return cut(
    stateTokens(source).flatMap((t): JisonToken[] => {
      const name = JISON_NAMES[t.kind];
      return name ? [[name, t.text]] : [];
    })
  );
}

const LS = String.fromCharCode(0x2028);
/** Lexer edge cases the corpus does not reach. */
const EDGES: CorpusItem[] = (
  [
    ['crlf', 'stateDiagram-v2\r\n  A --> B : go\r\n  note left of A\r\n  x\r\n  end note\r\n'],
    ['lone cr', 'stateDiagram-v2\r  A --> B\r  B --> C'],
    ['no trailing newline', 'stateDiagram'],
    ['leading blank lines', '\n\n  \nstateDiagram-v2\n  A'],
    ['uppercase keywords', 'STATEDIAGRAM-V2\n  STATE A {\n  B\n  }\n  NOTE LEFT OF A : hi\n'],
    ['entity in descr', 'stateDiagram-v2\n  A : a #colon; b #35; c\n  #x; --> B\n'],
    ['entity in note', 'stateDiagram-v2\n  note left of A : one #semi; two\n'],
    ['hash comment', 'stateDiagram-v2\n  A --> B\n  # a comment\n  state C { \n # x\n D }\n'],
    ['inline percent comment', 'stateDiagram-v2\n  A %% c\n  B%%d\n  state E as F%%g\n'],
    ['note id with comment', 'stateDiagram-v2\n  note left of A%%c\n  t\n  end note\n'],
    [
      'style semicolon drop',
      'stateDiagram-v2\n  style A fill:#f00;\n  classDef c fill:#0f0;stroke:#00f;\n',
    ],
    ['style word elsewhere', 'stateDiagram-v2\n  A : mystyle:#1 here;\n'],
    ['direction anywhere', 'stateDiagram-v2\n  A --> B : direction TB then direction LR\n'],
    ['direction across lines', 'stateDiagram-v2\n  direction\n  RL\n  A\n'],
    ['struct direction', 'stateDiagram-v2\n  state A {\n    direction BT\n    B\n  }\n'],
    [
      'fork join choice',
      'stateDiagram-v2\n  state f <<fork>>\n  state j [[join]]\n  state c <<choice>> x <<fork>>\n',
    ],
    [
      'state forms',
      'stateDiagram-v2\n  state "long desc" as L\n  state "x" as Y {\n  Z\n  }\n  state Q {\n  }\n',
    ],
    ['multi word state', 'stateDiagram-v2\n  state a b {\n  }\n'],
    ['floating note', 'stateDiagram-v2\n  note "floating" as N1\n  note "assume" as N2\n'],
    ['unclosed floating note', 'stateDiagram-v2\n  note "never closed'],
    ['unclosed state string', 'stateDiagram-v2\n  state "never closed'],
    ['scale', 'stateDiagram-v2\n  scale 350 width\n  A\n'],
    ['scale without width', 'stateDiagram-v2\n  scale 350\n  A\n'],
    [
      'acc values',
      'stateDiagram-v2\n  accTitle:\n  accDescr: d\n  accDescr {\n  multi\n  line\n  }\n  A',
    ],
    ['acc at end', 'stateDiagram-v2\n  accTitle: t'],
    [
      'class forms',
      'stateDiagram-v2\n  class a,b , c,  d x\n  class a,\n  classDef default fill:red\n',
    ],
    ['style ids', 'stateDiagram-v2\n  style a,b fill:red\n  style a\n'],
    ['separators', 'stateDiagram-v2\n  A:::c --> B:::d\n  A ::x\n  - x\n  C : a:b::c\n'],
    ['concurrency', 'stateDiagram-v2\n  state A {\n  B\n  --\n  C\n  -- \n  }\n  --\n'],
    ['struct oddities', 'stateDiagram-v2\n  state A {\n  B {\n  }\n'],
    ['click and strings', 'stateDiagram-v2\n  click A href "x"\n  default\n  "unclosed\n'],
    ['hide empty', 'stateDiagram-v2\n  hide empty description\n  hide empty descriptions\n'],
    ['line separator', `stateDiagram-v2\n  A --> B${LS}direction LR\n  C : x${LS}y\n`],
    [
      'note end forms',
      'stateDiagram-v2\n  note right of A\n  a\n  \n  END NOTE\n  note left of B\n  x end note\n  end notes\n  end note\n',
    ],
    ['note odd text', 'stateDiagram-v2\n  note left of A :t\n  note left of A\n  : spaced\n'],
    // Mid-line directives (#185, fixed in core `sourceView` by #186).
    ['comment line in mid-line directive', 'stateDiagram\nA %%{init: {\n  %%x "a": 1}}%%\nB'],
    ['style word in directive', 'stateDiagram\nA : x %%{init: {"a":"style"}}%% :#y;'],
  ] satisfies [string, string][]
).map(([id, source]) => ({ id: `edge/${id}`, source }));

async function corpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for (const dir of ['state-diagram', 'state-diagram-v2']) {
    for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams', dir), dir)) {
      items.push(item);
    }
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/state-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  const all = [...items, ...specs, ...EDGES];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}

/**
 * `src` with three comment lines after every line of the body, or one through the middle of a
 * one-line body. v12 removed them before lexing, so tokens must match across them.
 */
function commented(src: string): string {
  const head = /^---[\s\S]*?\n---[^\S\n]*\n/.exec(src)?.[0] ?? '';
  const body = src.slice(head.length);
  const lines = body.split('\n');
  const half = Math.floor(body.length / 2);
  const split = body.slice(0, half) + '\n%% cut\n' + body.slice(half);
  return head + (lines.length > 2 ? lines.join('\n' + '  %% c\n'.repeat(3)) : split);
}

describe('state lexer parity with mermaid v12 (jison)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings and edge cases', async () => {
    const oracle = await loadStateLexerOracle();
    const items = await corpus();
    const diffs: { id: string; at: number; v12: JisonToken[]; v13: JisonToken[] }[] = [];
    let compared = 0;
    for (const item of items) {
      const v12 = await oracle.tokens(item.source);
      if (!v12) continue;
      compared++;
      const expected = cut(v12.map(([n, i]): JisonToken => [n, v12Image(i)]));
      const actual = v13Tokens(item.source);
      if (JSON.stringify(expected) === JSON.stringify(actual)) continue;
      let at = 0;
      while (JSON.stringify(expected[at]) === JSON.stringify(actual[at])) at++;
      diffs.push({
        id: item.id,
        at,
        v12: expected.slice(Math.max(0, at - 2), at + 3),
        v13: actual.slice(Math.max(0, at - 2), at + 3),
      });
    }
    process.stdout.write(
      `state lexer parity: ${compared} of ${items.length} sources lexed by v12\n`
    );
    // 145 e2e fixtures (one is an `info` diagram) and 120 spec strings, with and without comments.
    expect(compared).toBeGreaterThan(560);
    const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');
    expect(
      diffs.map((d) => `${d.id} @${d.at}\n  v12 ${show(d.v12)}\n  v13 ${show(d.v13)}`)
    ).toEqual([]);
  }, 120_000);
});
