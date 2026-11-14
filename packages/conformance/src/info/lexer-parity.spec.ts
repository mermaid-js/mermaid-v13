import { describe, expect, it } from 'vitest';
import { cook, Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { infoTokens, LANGIUM_NAMES } from '@mermaid-js/diagram-info/testing';
import { v12TokenText } from '../v12-entities.ts';
import { loadLangiumLexerOracle } from '../langium-lexer.ts';
import type { LangiumLex, LangiumToken } from '../langium-lexer.ts';
import { infoGateCorpus, UNCLOSED_DIRECTIVE } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, D213, D220): the v13 info lexer emits the same tokens,
 * by Chevrotain token type name and image, as `@mermaid-js/parser@2.0.1`'s lexer on the text
 * v12 lexed, and the same hidden tokens. The method is pie's (`../pie/lexer-parity.spec.ts`).
 *
 * Normalisation, both sides:
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF and CR as
 *   LF (v13's {@link infoTokens} text);
 * - v12 appended a `\n` before lexing; v13 lexes a zero-width line break there, and the oracle
 *   takes that `\n` off the image of the token that matched it;
 * - on a lexer error (D220) both streams are cut at the first error, which must be at the same
 *   place: the error is written `LEXICAL_ERROR` with the length of the text before it, as v12's
 *   parser read it. Chevrotain skips characters and goes on; neither side is compared after.
 *
 * Every source is also lexed with CRLF line breaks and with comment lines added
 * (`commented()`), which v12 removed before lexing.
 *
 * Excluded: `unclosed directive …` ({@link UNCLOSED_DIRECTIVE}), core's reading of an
 * unclosed `%%{`, shared by every type; the spec checks one still differs.
 */
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

function v13Streams(source: string): Streams {
  const out: Streams = { tokens: [], hidden: [] };
  for (const t of infoTokens(source)) {
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

describe('info lexer parity with @mermaid-js/parser@2.0.1 (Chevrotain)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings and the cases', async () => {
    const oracle = await loadLangiumLexerOracle('info');
    const items = await infoGateCorpus();
    const diffs: string[] = [];
    let unclosed = 0;
    let compared = 0;
    let e2e = 0;
    let errors = 0;
    for (const item of items) {
      const lexed = await oracle.lex(item.source);
      if (!lexed) continue;
      compared++;
      if (item.id.startsWith('e2e/') && !item.id.endsWith(')')) e2e++;
      if (lexed.errorAt !== undefined) errors++;
      const v12 = v12Streams(lexed);
      const v13 = v13Streams(item.source);
      const tokens = firstDiff(v12.tokens, v13.tokens);
      const hidden = firstDiff(v12.hidden, v13.hidden);
      if (item.id.startsWith(UNCLOSED_DIRECTIVE)) {
        if (tokens ?? hidden) unclosed++;
        continue;
      }
      if (tokens) diffs.push(`${item.id} tokens ${tokens}`);
      if (hidden) diffs.push(`${item.id} hidden ${hidden}`);
    }
    process.stdout.write(
      `info lexer parity: ${compared} of ${items.length} sources lexed by v12, ${errors} with a lexer error\n`
    );
    // Every e2e fixture reaches the info lexer: 17 under info/, one under state-diagram-v2/.
    expect(e2e).toBe(18);
    expect(compared).toBeGreaterThan(300);
    expect(errors).toBeGreaterThan(30);
    // The exclusion is still needed: some unclosed directive still lexes differently.
    expect(unclosed).toBeGreaterThan(0);
    expect(diffs).toEqual([]);
  }, 120_000);
});
