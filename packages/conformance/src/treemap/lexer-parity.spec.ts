import { describe, expect, it } from 'vitest';
import { cook, Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { LANGIUM_NAMES, treemapTokens } from '@mermaid-js/diagram-treemap/testing';
import { v12TokenText } from '../v12-entities.ts';
import { loadLangiumLexerOracle } from '../langium-lexer.ts';
import type { LangiumLex, LangiumToken } from '../langium-lexer.ts';
import { treemapGateCorpus } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, D213, D220, spec #428 T1): the v13 treemap lexer emits
 * the same tokens, by Chevrotain token type name and image, as `@mermaid-js/parser@2.0.1`'s
 * treemap lexer on the text v12 lexed, and the same hidden tokens (`ML_COMMENT`, the only
 * hidden group: treemap's grammar does not import `common`).
 *
 * Normalisation, both sides (as pie's, radar's and packet's gates):
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF and CR as
 *   LF (v13's {@link treemapTokens} text);
 * - v12 appended a `\n` before lexing; the oracle takes it off the image of a token that
 *   matched it (a `classDef` with no styles at the end of the text);
 * - v12's `NL` and `WS` are skipped Chevrotain tokens, in neither of its lists; v13 writes
 *   `Kind.Newline` tokens for the parser (D401's diagnostics), which the gate leaves out;
 * - on a lexer error (D220) both streams are cut at the first error, which must be at the same
 *   place: the error is written `LEXICAL_ERROR` with the length of the text before it, as v12's
 *   parser read it. Chevrotain skips characters and goes on; neither side is compared after.
 *
 * Every source is also lexed with CRLF line breaks and with comment lines added
 * (`commented()`); `corpus/treemap-cases.json` adds the spec's quirks and U+2028/U+2029 cases.
 *
 * Exclusions ({@link EXCLUDED}, by id prefix, with every variant of the source):
 * - `treemap-cases/unclosed-directive…`: core's preprocess ends an unclosed `%%{` at its line
 *   end and reports `UNCLOSED_DIRECTIVE`, so v13 rejects the source; v12's directive regex also
 *   removed the line break after it (or, with a `{` argument, the rest of the text). The
 *   difference is in core's directive reading, shared by every type (pie's, radar's and
 *   packet's gates list it too), not in a treemap lexer rule.
 */
const EXCLUDED: ReadonlyMap<string, string> = new Map([
  [
    'treemap-cases/unclosed-directive',
    'core ends an unclosed directive at its line end (UNCLOSED_DIRECTIVE)',
  ],
]);
/**
 * The sources v12 never lexes as treemap (no diagram type detected, so its parser for the type
 * is not reached): `Treemap` (v12's detector is case-sensitive), and the `commented()` copies
 * of sources of at most two lines, whose comment line cuts the header word in two. Pinned so
 * that a growing skip fails.
 */
const NOT_LEXED: readonly string[] = [
  'treemap-cases/header-beta-only (commented)',
  'treemap-cases/header-indented (commented)',
  'treemap-cases/header-only (commented)',
  'treemap-cases/header-upper',
  'treemap-cases/header-upper (CRLF)',
  'treemap-cases/header-upper (commented)',
  'treemap-cases/leaf-no-blank (commented)',
  'treemap-cases/number-no-name (commented)',
  'treemap-cases/string-unterminated (commented)',
  'treemap-cases/string-unterminated-single (commented)',
  'v12-specs/treemap.test.ts#1 (commented)',
];
const ERROR = 'LEXICAL_ERROR';
const HIDDEN = new Set(['ML_COMMENT']);
/** Chevrotain's skipped token types: in neither list. */
const SKIPPED = new Set(['NL']);

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

function v13Streams(source: string): Streams {
  const out: Streams = { tokens: [], hidden: [] };
  for (const t of treemapTokens(source)) {
    const name = LANGIUM_NAMES[t.kind] ?? `kind ${t.kind}`;
    if (t.kind === Kind.Error) {
      out.tokens.push([ERROR, `@${lexedBefore(source, t.range.start).length}`]);
      break;
    }
    if (SKIPPED.has(name)) continue;
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

describe('treemap lexer parity with @mermaid-js/parser@2.0.1 (Chevrotain)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings and the cases', async () => {
    const oracle = await loadLangiumLexerOracle('treemap');
    const items = await treemapGateCorpus();
    const diffs: string[] = [];
    // Exclusions that still differ somewhere, so each one is still needed.
    const needed = new Set<string>();
    let compared = 0;
    let e2e = 0;
    let errors = 0;
    const notLexed: string[] = [];
    for (const item of items) {
      const lexed = await oracle.lex(item.source);
      if (!lexed) {
        notLexed.push(item.id);
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
    process.stdout.write(
      `treemap lexer parity: ${compared} of ${items.length} sources lexed by v12, ${errors} with a lexer error\n`
    );
    expect(diffs).toEqual([]);
    expect([...needed].sort()).toEqual([...EXCLUDED.keys()].sort());
    expect(notLexed.sort()).toEqual(NOT_LEXED);
    // Every e2e fixture reaches the treemap lexer (26 from v12, 6 `parser-*` from #484, 21
    // baselines from #514, 1 from #844, 1 from #1403).
    expect(e2e).toBe(55);
    expect(compared).toBe(items.length - NOT_LEXED.length);
  }, 300_000);
});
