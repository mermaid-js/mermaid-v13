import { describe, expect, it } from 'vitest';
import { cook, Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { architectureTokens, LANGIUM_NAMES } from '@mermaid-js/diagram-architecture/testing';
import { decodeEntities } from '../flowchart/v12.ts';
import { loadLangiumLexerOracle } from '../langium-lexer.ts';
import type { LangiumLex, LangiumToken } from '../langium-lexer.ts';
import { architectureGateCorpus } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, D213, D220, spec #525 T1): the v13 architecture lexer
 * emits the same tokens, by Chevrotain token type name and image, as `@mermaid-js/parser@2.0.1`'s
 * architecture lexer on the text v12 lexed, and the same hidden tokens. That includes v12's
 * split of names that start with a capital `L`, `R`, `T` or `B` (`Backend` is `B` then `ackend`)
 * or with `title`, and the keywords `row`, `in`, `group` read as keywords where an id is meant.
 *
 * Normalisation, both sides (as wardley's gate):
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF and CR as
 *   LF (v13's {@link architectureTokens} text);
 * - v12 appended a `\n` before lexing; v13 lexes a zero-width line break there, and the oracle
 *   takes that `\n` off the image of the token that matched it;
 * - on a lexer error (D220) both streams are cut at the first error, which must be at the same
 *   place: the error is written `LEXICAL_ERROR` with the length of the text before it, as v12's
 *   parser read it. Chevrotain skips characters and goes on; neither side is compared after.
 *
 * Every source is also lexed with CRLF line breaks and with comment lines added
 * (`commented()`), which v12 removed before lexing; `corpus/architecture-cases.json` adds the
 * spec's quirks and the U+2028/U+2029 and other `\s` cases.
 *
 * Every source the gate does not compare is named, and the sets are asserted exactly, so the
 * gate fails when one of them starts to match (or to reach v12) or a new one appears:
 * - {@link EXCLUDED}: `architecture-cases/unclosed-directive*`, a `%%{` that starts a line and
 *   is never closed (in every variant but `unclosed-directive (commented)`, whose comment lines
 *   leave v12 the same text, so it is gated). Core's preprocess ends it at its line end and
 *   reports `UNCLOSED_DIRECTIVE` (an error: v13 rejects the source, asserted); v12's directive
 *   regex also removed the line break after it (or, with a `{` argument, the rest of the text).
 *   The difference is in core's directive reading, shared by every type (pie's, radar's and
 *   wardley's gates list it too), not in an architecture lexer rule. An unclosed `%%{` after a
 *   statement (`architecture-cases/directive-unclosed-in-line`) is gated.
 * - {@link NOT_REACHED}: the sources v12 never lexed as architecture: the cases written so
 *   (`header-upper`, `header-mixed-case`: v12's detector is `/^\s*architecture/`, case
 *   sensitive) and `header-cut-short-by-directive` (no `architecture` once the directive is cut)
 *   in every variant, and the `commented()` copies of short sources, whose cut falls
 *   inside the header. `architecture` alone is detected and lexed (as an ID), so it is gated.
 */
const UNCLOSED = 'core ends an unclosed directive at its line end (UNCLOSED_DIRECTIVE)';
const variants = (id: string) => [id, `${id} (CRLF)`, `${id} (commented)`];
const EXCLUDED: ReadonlyMap<string, string> = new Map(
  [
    'architecture-cases/unclosed-directive',
    'architecture-cases/unclosed-directive (CRLF)',
    ...variants('architecture-cases/unclosed-directive-init'),
  ].map((id) => [id, UNCLOSED])
);
const CUT_HEADER = 'the commented() cut falls inside the header';
const NOT_REACHED: ReadonlyMap<string, string> = new Map([
  ...[
    ...variants('architecture-cases/header-mixed-case'),
    ...variants('architecture-cases/header-upper'),
  ].map((id) => [id, 'v12 detects architecture in lower case only'] as const),
  ...variants('architecture-cases/header-cut-short-by-directive').map(
    (id) => [id, 'with the directive cut, the header is `architect`: v12 detects nothing'] as const
  ),
  ...[
    'architecture-cases/header-alone',
    'architecture-cases/header-bare',
    'architecture-cases/header-cut-by-directive',
    'v12-specs/architecture.spec.ts#1',
    'v12-specs/architecture.test.ts#1',
    'v12-specs/architecture.test.ts#3',
    'v12-specs/architecture.test.ts#4',
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
  for (const t of architectureTokens(source)) {
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
  const pre = preprocess(source);
  const view = sourceView(
    source,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
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

describe('architecture lexer parity with @mermaid-js/parser@2.0.1 (Chevrotain)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings and the cases', async () => {
    const oracle = await loadLangiumLexerOracle('architecture');
    const items = await architectureGateCorpus();
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
        if (NOT_REACHED.get(item.id) === CUT_HEADER && item.source.includes('architecture')) {
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
      `architecture lexer parity: ${compared} of ${items.length} sources lexed by v12, ${errors} with a lexer error\n`
    );
    expect(diffs).toEqual([]);
    expect(excluded.sort()).toEqual([...EXCLUDED.keys()].sort());
    expect(accepted).toEqual([]);
    expect(unreached.sort()).toEqual([...NOT_REACHED.keys()].sort());
    expect(headerKept).toEqual([]);
    // Every e2e fixture reaches the architecture lexer: the 20 v12 ones and the 8 `lexer-*` ones
    // of `nightly-check/` (#594: arrowheads, text icons, quoted labels, names, the header's line,
    // blanks, a labelled `{group}` edge, like-side and self edges), and the 2 `layout-*` ones
    // (#607: bends as written, `iconSize` and `padding`), and the 6 baselines (#618).
    expect(e2e).toBe(36);
    expect(compared).toBe(items.length - NOT_REACHED.size);
  }, 300_000);
});
