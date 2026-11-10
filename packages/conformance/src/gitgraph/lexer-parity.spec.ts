import { describe, expect, it } from 'vitest';
import { cook, Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import {
  GitGraphTokenKind,
  gitGraphTokens,
  LANGIUM_NAMES,
} from '@mermaid-js/diagram-gitgraph/testing';
import { decodeEntities } from '../flowchart/v12.ts';
import { LANGIUM_LEXERS, loadLangiumLexerOracle } from '../langium-lexer.ts';
import { rowOf } from '../tables.ts';
import type { LangiumLex, LangiumToken } from '../langium-lexer.ts';
import { gitGraphGateCorpus } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, D213, D220, D262): the v13 gitGraph lexer emits the same
 * tokens, by Chevrotain token type name and image, as `@mermaid-js/parser@2.0.1`'s lexer on the
 * text v12 lexed, and the same hidden tokens.
 *
 * Normalisation, both sides:
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF and CR as
 *   LF (v13's {@link gitGraphTokens} text);
 * - v12 appended a `\n` before lexing; v13 lexes a zero-width line break there, and the oracle
 *   takes that `\n` off the image of the token that matched it;
 * - on a lexer error (D220) both streams are cut at the first error, which must be at the same
 *   place: the error is written `LEXICAL_ERROR` with the length of the text before it, as v12's
 *   parser read it. Chevrotain skips characters and goes on; neither side is compared after.
 *
 * Every source is also lexed with CRLF line breaks and with comment lines added (`commented()`),
 * which v12 removed before lexing, and line-separator cases are added.
 *
 * Every v13 kind has a Chevrotain name. The spans v12 removed before lexing (comment lines,
 * directives) are left out of {@link gitGraphTokens}, as they never reached v12's lexer, and
 * WHITESPACE is a skipped Chevrotain token that v13 writes no token for.
 *
 * Exclusions ({@link EXCLUDED}, by id prefix, with every variant of the source):
 * - `unclosed directive …`: core's preprocess ends an unclosed `%%{` at its line end and
 *   reports `UNCLOSED_DIRECTIVE`, so v13 rejects the source; v12's directive regex also removed
 *   the line break after it (or, with a `{` argument, the rest of the text). The difference is
 *   in core's directive reading, shared by every type, not in a gitGraph lexer rule.
 */
const EXCLUDED: ReadonlyMap<string, string> = new Map([
  ['unclosed directive ', 'core ends an unclosed directive at its line end (UNCLOSED_DIRECTIVE)'],
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
  for (const t of gitGraphTokens(source)) {
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

/** v12's token types for gitGraph, in Chevrotain's match order. */
async function v12Vocabulary(): Promise<string[]> {
  const { factory, key } = rowOf(LANGIUM_LEXERS, 'gitGraph', 'LANGIUM_LEXERS');
  const parser = (await import('mermaid-parser-v12')) as unknown as Record<
    string,
    () => Record<string, { parser: { Lexer: { definition: Record<string, { name: string }> } } }>
  >;
  // Langium keeps the token types by name, in the order Chevrotain tries them.
  const definition = parser[factory]?.()[key]?.parser.Lexer.definition ?? {};
  return Object.values(definition).map((t) => t.name);
}

describe('gitGraph lexer parity with @mermaid-js/parser@2.0.1 (Chevrotain)', () => {
  it('has 2.0.1’s token vocabulary, in its match order', async () => {
    const v12 = await v12Vocabulary();
    const v13 = Object.values(LANGIUM_NAMES).filter((n) => n !== ERROR);
    // WHITESPACE is skipped: v13 writes no token for it.
    expect([...v13, 'WHITESPACE'].sort()).toEqual([...v12].sort());
    // The diagram's own kinds are numbered in Chevrotain's order.
    const own = Object.values(GitGraphTokenKind).map((k) => LANGIUM_NAMES[k]);
    expect(own).toEqual(v12.filter((n) => own.includes(n)));
  });

  it('emits the same tokens over the e2e fixtures, the v12 spec strings and the quirks', async () => {
    const oracle = await loadLangiumLexerOracle('gitGraph');
    const items = await gitGraphGateCorpus();
    const diffs: string[] = [];
    // Exclusions that still differ somewhere, so each one is still needed.
    const needed = new Set<string>();
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
      `gitGraph lexer parity: ${compared} of ${items.length} sources lexed by v12, ${errors} with a lexer error\n`
    );
    // Every e2e fixture reaches the gitGraph lexer.
    expect(e2e).toBe(197);
    expect(compared).toBeGreaterThan(1000);
    expect(diffs).toEqual([]);
  }, 300_000);
});
