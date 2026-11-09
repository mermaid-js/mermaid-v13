import { describe, expect, it } from 'vitest';
import { cook, Kind } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { LANGIUM_NAMES, wardleyTokens, wardleyView } from '@mermaid-js/diagram-wardley/testing';
import { decodeEntities } from '../flowchart/v12.ts';
import { loadLangiumLexerOracle } from '../langium-lexer.ts';
import type { LangiumLex, LangiumToken } from '../langium-lexer.ts';
import { wardleyGateCorpus } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, D213, D220, spec #430 T1): the v13 wardley lexer emits
 * the same tokens, by Chevrotain token type name and image, as `@mermaid-js/parser@2.0.1`'s
 * wardley lexer on the text v12 lexed, and the same hidden tokens. That includes v12's split of
 * names that start with a keyword or a strategy (`notebook` is `KW_NOTE NAME_WITH_SPACES`, D423).
 *
 * Normalisation, both sides (as radar's gate):
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF and CR as
 *   LF (v13's {@link wardleyTokens} text);
 * - v12 appended a `\n` before lexing; v13 lexes a zero-width line break there, and the oracle
 *   takes that `\n` off the image of the token that matched it;
 * - on a lexer error (D220) both streams are cut at the first error, which must be at the same
 *   place: the error is written `LEXICAL_ERROR` with the length of the text before it, as v12's
 *   parser read it. Chevrotain skips characters and goes on; neither side is compared after.
 *
 * Every source is also lexed with CRLF line breaks and with comment lines added
 * (`commented()`), which v12 removed before lexing; `corpus/wardley-cases.json` adds the spec's
 * quirks and the U+2028/U+2029 and other `\s` cases.
 *
 * Every source the gate does not compare is named, and the sets are asserted exactly, so the
 * gate fails when one of them starts to match (or to reach v12) or a new one appears:
 * - {@link EXCLUDED}: `wardley-cases/unclosed-directive*`, a `%%{` that starts a line and is
 *   never closed (in every variant but `unclosed-directive (commented)`, whose comment lines
 *   leave v12 the same text, so it is gated). Core's preprocess ends it at its line end and reports
 *   `UNCLOSED_DIRECTIVE` (an error: v13 rejects the source, asserted); v12's directive regex
 *   also removed the line break after it (or, with a `{` argument, the rest of the text). The
 *   difference is in core's directive reading, shared by every type (pie's and radar's gates
 *   list it too), not in a wardley lexer rule. An unclosed `%%{` after a statement
 *   (`wardley-cases/directive-unclosed-in-line`) is gated.
 * - {@link NOT_REACHED}: the sources v12 never lexed as wardley: the case written so
 *   (`not-wardley-bare`, `wardley` alone is not detected) in every variant, and the
 *   `commented()` copies of short sources, whose cut falls inside the header.
 */
const UNCLOSED = 'core ends an unclosed directive at its line end (UNCLOSED_DIRECTIVE)';
const variants = (id: string) => [id, `${id} (CRLF)`, `${id} (commented)`];
const EXCLUDED: ReadonlyMap<string, string> = new Map(
  [
    'wardley-cases/unclosed-directive',
    'wardley-cases/unclosed-directive (CRLF)',
    ...variants('wardley-cases/unclosed-directive-init'),
  ].map((id) => [id, UNCLOSED])
);
const CUT_HEADER = 'the commented() cut falls inside the header';
const NOT_REACHED: ReadonlyMap<string, string> = new Map([
  ...variants('wardley-cases/not-wardley-bare').map(
    (id) => [id, 'wardley alone is not detected'] as const
  ),
  ...[
    'v12-specs/wardleyParser.spec.ts#1',
    'wardley-cases/acc-title-no-colon',
    'wardley-cases/header-alone',
    'wardley-cases/header-upper',
    'wardley-cases/links-bare-arrow-label',
    'wardley-cases/links-bare-unquoted',
    'wardley-cases/links-dash-dot-dash',
    'wardley-cases/links-diamond',
    'wardley-cases/links-dotted-dead',
    'wardley-cases/links-fat',
    'wardley-cases/links-reverse',
    'wardley-cases/title-at-end',
    'wardley-cases/title-cr-end',
    'wardley-cases/title-only-blank',
  ].map((id) => [`${id} (commented)`, CUT_HEADER] as const),
]);
const ERROR = 'LEXICAL_ERROR';
const HIDDEN = new Set(['YAML', 'DIRECTIVE', 'SINGLE_LINE_COMMENT']);

interface Streams {
  tokens: LangiumToken[];
  hidden: LangiumToken[];
}

function v12Streams(lexed: LangiumLex): Streams {
  const decode = ([n, i]: LangiumToken): LangiumToken => [n, decodeEntities(i)];
  const tokens = lexed.tokens.map(decode);
  if (lexed.errorAt !== undefined) {
    const before = decodeEntities(lexed.input.slice(0, lexed.errorAt));
    tokens.push([ERROR, `@${before.length}`]);
  }
  return { tokens, hidden: lexed.hidden.map(decode) };
}

function v13Streams(source: string): Streams {
  const out: Streams = { tokens: [], hidden: [] };
  for (const t of wardleyTokens(source)) {
    const name = LANGIUM_NAMES[t.kind] ?? `kind ${t.kind}`;
    if (t.kind === Kind.Error) {
      out.tokens.push([ERROR, `@${lexedBefore(source, t.range.start).length}`]);
      break;
    }
    (HIDDEN.has(name) ? out.hidden : out.tokens).push([name, t.text]);
  }
  return out;
}

/** The text v12's lexer read before source offset `at`: v12's text, trimmed at its start. */
function lexedBefore(source: string, at: number): string {
  const { bodyStart, view } = wardleyView(source);
  return cook(source, bodyStart, at, view).trimStart();
}

const show = (t: LangiumToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');

function firstDiff(a: LangiumToken[], b: LangiumToken[]): string | undefined {
  if (JSON.stringify(a) === JSON.stringify(b)) return undefined;
  let at = 0;
  while (JSON.stringify(a[at]) === JSON.stringify(b[at])) at++;
  const from = Math.max(0, at - 2);
  return `@${at}\n    v12 ${show(a.slice(from, at + 3))}\n    v13 ${show(b.slice(from, at + 3))}`;
}

describe('wardley lexer parity with @mermaid-js/parser@2.0.1 (Chevrotain)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings and the cases', async () => {
    const oracle = await loadLangiumLexerOracle('wardley');
    const items = await wardleyGateCorpus();
    const diffs: string[] = [];
    const excluded: string[] = [];
    const unreached: string[] = [];
    const headerKept: string[] = [];
    const accepted: string[] = [];
    let compared = 0;
    let e2e = 0;
    let errors = 0;
    for (const item of items) {
      const lexed = await oracle.lex(item.source);
      if (!lexed) {
        unreached.push(item.id);
        // For the reason given: the header no longer appears whole.
        if (NOT_REACHED.get(item.id) === CUT_HEADER && /wardley-beta/i.test(item.source)) {
          headerKept.push(item.id);
        }
        continue;
      }
      compared++;
      if (item.id.startsWith('e2e/') && !item.id.endsWith(')')) e2e++;
      if (lexed.errorAt !== undefined) errors++;
      const v12 = v12Streams(lexed);
      const v13 = v13Streams(item.source);
      const tokens = firstDiff(v12.tokens, v13.tokens);
      const hidden = firstDiff(v12.hidden, v13.hidden);
      if (EXCLUDED.has(item.id)) {
        // Still different, and for the reason given: v13 rejects the source in preprocess.
        if (tokens ?? hidden) excluded.push(item.id);
        const unclosed = preprocess(item.source).diagnostics.some(
          (d) => d.code === 'UNCLOSED_DIRECTIVE' && d.severity === 'error'
        );
        if (!unclosed) accepted.push(item.id);
        continue;
      }
      if (tokens) diffs.push(`${item.id} tokens ${tokens}`);
      if (hidden) diffs.push(`${item.id} hidden ${hidden}`);
    }
    process.stdout.write(
      `wardley lexer parity: ${compared} of ${items.length} sources lexed by v12, ${errors} with a lexer error\n`
    );
    expect(diffs).toEqual([]);
    expect(excluded.sort()).toEqual([...EXCLUDED.keys()].sort());
    expect(accepted).toEqual([]);
    expect(unreached.sort()).toEqual([...NOT_REACHED.keys()].sort());
    expect(headerKept).toEqual([]);
    // Every e2e fixture reaches the wardley lexer: the 10 of `pr-check/`, the parser's 33 of
    // `nightly-check/` (#489, #493), the renderer's 11 (#493) and the 12 baselines (#497).
    expect(e2e).toBe(66);
    expect(compared).toBe(items.length - NOT_REACHED.size);
  }, 300_000);
});
