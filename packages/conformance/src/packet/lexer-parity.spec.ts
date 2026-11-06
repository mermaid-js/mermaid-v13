import { describe, expect, it } from 'vitest';
import { cook, Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { LANGIUM_NAMES, packetTokens } from '@mermaid-js/diagram-packet/testing';
import { decodeEntities } from '../flowchart/v12.ts';
import { loadLangiumLexerOracle } from '../langium-lexer.ts';
import type { LangiumLex, LangiumToken } from '../langium-lexer.ts';
import { packetGateCorpus } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, D213, D220): the v13 packet lexer emits the same tokens,
 * by Chevrotain token type name and image, as `@mermaid-js/parser@2.0.1`'s lexer on the text
 * v12 lexed, and the same hidden tokens.
 *
 * Normalisation, both sides:
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF and CR as
 *   LF (v13's {@link packetTokens} text);
 * - v12 appended a `\n` before lexing; v13 lexes a zero-width line break there, and the oracle
 *   takes that `\n` off the image of the token that matched it;
 * - on a lexer error (D220) both streams are cut at the first error, which must be at the same
 *   place: the error is written `LEXICAL_ERROR` with the length of the text before it, as v12's
 *   parser read it. Chevrotain skips characters and goes on; neither side is compared after.
 *
 * Every source is also lexed with CRLF line breaks and with comment lines added (`commented()`).
 *
 * Every v13 kind has a Chevrotain name. The spans v12 removed before lexing (comment lines,
 * directives) are left out of {@link packetTokens}, as they never reached v12's lexer, and
 * WHITESPACE is a skipped Chevrotain token that v13 writes no token for.
 *
 * Exclusions ({@link EXCLUDED}, by id prefix, with every variant of the source):
 * - `packet-cases/unclosed-directive…`: core's preprocess ends an unclosed `%%{` at its line
 *   end and reports `UNCLOSED_DIRECTIVE`, so v13 rejects the source; v12's directive regex also
 *   removed the line break after it (or, with a `{` argument, the rest of the text). The
 *   difference is in core's directive reading, shared by every type (pie's gate lists it too),
 *   not in a packet lexer rule.
 */
const EXCLUDED: ReadonlyMap<string, string> = new Map([
  [
    'packet-cases/unclosed-directive',
    'core ends an unclosed directive at its line end (UNCLOSED_DIRECTIVE)',
  ],
]);
/**
 * The sources v12 never lexes as packet (no diagram type detected, so its parser for the type
 * is not reached). `PACKET` and `Packet-Beta`, with every variant: v12's detector is
 * case-sensitive. The `commented()` copies of sources of at most two lines: `commented()` puts
 * its comment line in the middle of the text, which cuts the header word in two (`pac` and
 * `ket`). Pinned so that a growing skip fails.
 */
const NOT_LEXED = [
  'packet-cases/header-mixed-case',
  'packet-cases/header-mixed-case (CRLF)',
  'packet-cases/header-mixed-case (commented)',
  'packet-cases/header-only (commented)',
  'packet-cases/header-upper',
  'packet-cases/header-upper (CRLF)',
  'packet-cases/header-upper (commented)',
  'packet-cases/string-number-label (commented)',
  'packet-cases/string-unquoted-label (commented)',
  'v12-specs/packet.spec.ts#1 (commented)',
  'v12-specs/packet.spec.ts#2 (commented)',
  'v12-specs/packet.test.ts#3 (commented)',
  'v12-specs/packet.test.ts#4 (commented)',
  'v12-specs/packet.test.ts#7 (commented)',
  'v12-specs/packet.test.ts#8 (commented)',
];
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
  for (const t of packetTokens(source)) {
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

describe('packet lexer parity with @mermaid-js/parser@2.0.1 (Chevrotain)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings and the cases', async () => {
    const oracle = await loadLangiumLexerOracle('packet');
    const items = await packetGateCorpus();
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
    expect([...needed].sort()).toEqual([...EXCLUDED.keys()].sort());
    expect(notLexed.sort()).toEqual(NOT_LEXED);
    process.stdout.write(
      `packet lexer parity: ${compared} of ${items.length} sources lexed by v12, ${errors} with a lexer error\n`
    );
    // Every e2e fixture reaches the packet lexer.
    expect(e2e).toBe(6);
    expect(compared).toBe(items.length - NOT_LEXED.length);
    expect(diffs).toEqual([]);
  }, 120_000);
});
