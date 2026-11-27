import { describe, expect, it } from 'vitest';
import { cook, Kind } from '@mermaid-js/core/parser-kit';
import {
  cynefinTokens,
  cynefinVerbatimTokens,
  LANGIUM_NAMES,
  lexCynefin,
} from '@mermaid-js/diagram-cynefin/testing';
import type { CynefinToken } from '@mermaid-js/diagram-cynefin/testing';
import { v12TokenText } from '../v12-entities.ts';
import { loadLangiumLexerOracle } from '../langium-lexer.ts';
import type { LangiumLex, LangiumToken } from '../langium-lexer.ts';
import { commented } from '../sequence/corpus.ts';
import { cynefinCorpus, cynefinGateCorpus } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, D213, D220): the v13 cynefin lexer emits the same tokens,
 * by Chevrotain token type name and image, as `@mermaid-js/parser@2.0.1`'s lexer on the text
 * v12 lexed, and the same hidden tokens.
 *
 * Normalisation, both sides:
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF and CR as
 *   LF (v13's {@link cynefinTokens} text);
 * - v12 appended a `\n` before lexing; v13 lexes a zero-width line break there, and the oracle
 *   takes that `\n` off the image of the token that matched it;
 * - on a lexer error (D220) both streams are cut at the first error, which must be at the same
 *   place: the error is written `LEXICAL_ERROR` with the length of the text before it, as v12's
 *   parser read it. Chevrotain skips characters and goes on; neither side is compared after.
 *
 * The sources are the e2e fixtures, the harvested v12 strings and the quirk cases
 * (`corpus/cynefin-cases.json`, with the line-separator cases), each also lexed with CRLF line
 * breaks and with comment lines added (`commented()`), which v12 removed before lexing.
 *
 * Every v13 kind has a Chevrotain name. The spans v12 removed before lexing (comment lines,
 * directives) are left out of {@link cynefinTokens}, as they never reached v12's lexer, and
 * WHITESPACE is a skipped Chevrotain token that v13 writes no token for.
 *
 * The sources v12 never detects as cynefin, so its lexer never sees them, are listed in
 * {@link NOT_DETECTED} with the reason; any other source that drops out fails the gate.
 *
 * v12's `cynefin.integration.spec.ts` called the parser directly, so its strings reached
 * Chevrotain raw: whole-line `%%` comments were SINGLE_LINE_COMMENT tokens, not cut. The second
 * test lexes those strings (and their CRLF and commented copies) as given on both sides
 * ({@link cynefinVerbatimTokens} and the oracle's `lexText`), which gates that rule.
 *
 * Exclusions ({@link EXCLUDED}, by id prefix, with every variant of the source):
 * - `cynefin-cases/unclosed-directive-…`: core's preprocess ends an unclosed `%%{` at its line
 *   end and reports `UNCLOSED_DIRECTIVE`, so v13 rejects the source; v12's directive regex also
 *   removed the line break after it (or, with a `{` argument, the rest of the text). The
 *   difference is in core's directive reading, shared by every type (pie excludes it too), not in
 *   a cynefin lexer rule.
 */
const EXCLUDED: ReadonlyMap<string, string> = new Map([
  [
    'cynefin-cases/unclosed-directive-',
    'core ends an unclosed directive at its line end (UNCLOSED_DIRECTIVE)',
  ],
]);
/** Why v12 never detects a source as cynefin: header-less, or the header is not `cynefin-beta`. */
const UNDETECTED = {
  glued: '`cynefin-betax`: the detector wants a blank, `:` or the end after the header',
  upper: '`CYNEFIN-BETA`: the detector is case-sensitive',
  cut: '`commented()` splits a source of two lines or fewer mid-text, cutting the header in half',
};
/** Every gate source v12 never lexes, by id, and why. The dropped set must equal it. */
const NOT_DETECTED: ReadonlyMap<string, string> = new Map([
  ...['', ' (CRLF)', ' (commented)'].flatMap((v): [string, string][] => [
    [`cynefin-cases/header-glued-word${v}`, UNDETECTED.glued],
    [`cynefin-cases/header-upper${v}`, UNDETECTED.upper],
  ]),
  ...[
    'domain-no-boundary-clear',
    'domain-prefix',
    'header-colon',
    'header-blanks',
    'header-colon-space',
    'acc-title-no-colon',
    'header-only',
    'separator-header',
    'separator-before-header',
  ].map((id): [string, string] => [`cynefin-cases/${id} (commented)`, UNDETECTED.cut]),
]);
const ERROR = 'LEXICAL_ERROR';
const HIDDEN = new Set(['YAML', 'DIRECTIVE', 'SINGLE_LINE_COMMENT']);

interface Streams {
  tokens: LangiumToken[];
  hidden: LangiumToken[];
}

function v12Streams(lexed: LangiumLex): Streams {
  const decode = ([n, i]: LangiumToken): LangiumToken => [n, v12TokenText(i)];
  const tokens = lexed.tokens.map(decode);
  if (lexed.errorAt !== undefined) {
    const before = v12TokenText(lexed.input.slice(0, lexed.errorAt));
    tokens.push([ERROR, `@${before.length}`]);
  }
  return { tokens, hidden: lexed.hidden.map(decode) };
}

/** v13's streams; `errorAt` gives an error's place in the units the v12 side writes. */
function streamsOf(tokens: CynefinToken[], errorAt: (t: CynefinToken) => number): Streams {
  const out: Streams = { tokens: [], hidden: [] };
  for (const t of tokens) {
    const name = LANGIUM_NAMES[t.kind] ?? `kind ${t.kind}`;
    if (t.kind === Kind.Error) {
      out.tokens.push([ERROR, `@${errorAt(t)}`]);
      break;
    }
    (HIDDEN.has(name) ? out.hidden : out.tokens).push([name, t.text]);
  }
  return out;
}

const v13Streams = (source: string): Streams =>
  streamsOf(cynefinTokens(source), (t) => lexedBefore(source, t.range.start).length);

/** The text v12's lexer read before source offset `at`: v12's text, trimmed at its start. */
function lexedBefore(source: string, at: number): string {
  const { pre, view } = lexCynefin(source);
  return cook(source, pre.bodyStart, at, view).trimStart();
}

const show = (t: LangiumToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');

function firstDiff(a: LangiumToken[], b: LangiumToken[]): string | undefined {
  if (JSON.stringify(a) === JSON.stringify(b)) return undefined;
  let at = 0;
  while (JSON.stringify(a[at]) === JSON.stringify(b[at])) at++;
  const from = Math.max(0, at - 2);
  return `@${at}\n    v12 ${show(a.slice(from, at + 3))}\n    v13 ${show(b.slice(from, at + 3))}`;
}

describe('cynefin lexer parity with @mermaid-js/parser@2.0.1 (Chevrotain)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings and the quirks', async () => {
    const oracle = await loadLangiumLexerOracle('cynefin');
    const items = await cynefinGateCorpus();
    const diffs: string[] = [];
    // Exclusions that still differ somewhere, so each one is still needed.
    const needed = new Set<string>();
    let compared = 0;
    let e2e = 0;
    let errors = 0;
    const dropped: string[] = [];
    for (const item of items) {
      const lexed = await oracle.lex(item.source);
      if (!lexed) {
        dropped.push(item.id);
        continue;
      }
      compared++;
      if (item.id.startsWith('e2e/') && !item.id.endsWith(')')) e2e++;
      if (lexed.errorAt !== undefined) errors++;
      const v12 = v12Streams(lexed);
      const v13 = v13Streams(item.source);
      const tokens = firstDiff(v12.tokens, v13.tokens);
      const hidden = firstDiff(v12.hidden, v13.hidden);
      const exclusion = [...EXCLUDED.keys()].find((k) => item.id.startsWith(k));
      if (exclusion !== undefined) {
        if (tokens ?? hidden) needed.add(exclusion);
        continue;
      }
      if (tokens) diffs.push(`${item.id} tokens ${tokens}`);
      if (hidden) diffs.push(`${item.id} hidden ${hidden}`);
    }
    expect([...needed].sort()).toEqual([...EXCLUDED.keys()].sort());
    process.stdout.write(
      `cynefin lexer parity: ${compared} of ${items.length} sources lexed by v12, ${errors} with a lexer error\n`
    );
    // Every e2e fixture reaches the cynefin lexer: the 12 v12 fixtures, the 21 baselines and
    // #1039's override fixture and #1368's two label-syntax fixtures.
    expect(e2e).toBe(36);
    expect(dropped.sort()).toEqual([...NOT_DETECTED.keys()].sort());
    expect(compared).toBe(items.length - NOT_DETECTED.size);
    expect(diffs).toEqual([]);
  }, 120_000);

  it('emits the same tokens on the raw strings of cynefin.integration.spec.ts', async () => {
    const oracle = await loadLangiumLexerOracle('cynefin');
    const raw = (await cynefinCorpus()).filter((item) =>
      item.id.startsWith('v12-specs/cynefin.integration.spec.ts#')
    );
    expect(raw).toHaveLength(16);
    const items = [
      ...raw,
      ...raw.map((item) => ({
        id: `${item.id} (CRLF)`,
        source: item.source.replace(/\n/g, '\r\n'),
      })),
      ...raw.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
    ];
    const diffs: string[] = [];
    let comments = 0;
    for (const item of items) {
      const lexed = oracle.lexText(item.source);
      const v12: Streams = { tokens: [...lexed.tokens], hidden: lexed.hidden };
      if (lexed.errorAt !== undefined) v12.tokens.push([ERROR, `@${lexed.errorAt}`]);
      const v13 = streamsOf(cynefinVerbatimTokens(item.source), (t) => t.range.start);
      comments += v12.hidden.filter(([name]) => name === 'SINGLE_LINE_COMMENT').length;
      const tokens = firstDiff(v12.tokens, v13.tokens);
      const hidden = firstDiff(v12.hidden, v13.hidden);
      if (tokens) diffs.push(`${item.id} tokens ${tokens}`);
      if (hidden) diffs.push(`${item.id} hidden ${hidden}`);
    }
    // The comment lines reached Chevrotain: SINGLE_LINE_COMMENT is compared.
    expect(comments).toBeGreaterThan(16);
    expect(diffs).toEqual([]);
  }, 60_000);
});
