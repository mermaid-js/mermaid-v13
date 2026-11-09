/**
 * The railroad lexer-parity gate (parser-method §1, D213, D220, spec #526 T1), shared by the
 * four notations' specs (`lexer-parity-{ir,ebnf,abnf,peg}.spec.ts`): the v13 lexer for a
 * notation emits the same tokens, by Chevrotain token type name and image, as
 * `@mermaid-js/parser@2.0.1`'s lexer for that notation on the text v12 lexed, and the same
 * hidden tokens.
 *
 * Normalisation, both sides (as wardley's and radar's gates):
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF and CR as
 *   LF (v13's `railroadTokens` text);
 * - v12 appended a `\n` before lexing, which is whitespace in every notation; the oracle takes
 *   it off the image of a token that matched it;
 * - on a lexer error (D220) both streams are cut at the first error, which must be at the same
 *   place: the error is written `LEXICAL_ERROR` with the length of the text before it, as v12's
 *   parser read it. Chevrotain skips characters and goes on; neither side is compared after.
 */
import { cook, Kind } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import {
  LANGIUM_HIDDEN,
  LANGIUM_NAMES,
  railroadTokens,
  railroadView,
} from '@mermaid-js/diagram-railroad/testing';
import type { RailroadNotation } from '@mermaid-js/diagram-railroad/testing';
import { decodeEntities } from '../flowchart/v12.ts';
import { loadLangiumLexerOracle } from '../langium-lexer.ts';
import type { LangiumLex, LangiumToken } from '../langium-lexer.ts';
import { notationOf, railroadGateCorpus } from './corpus.ts';

const ERROR = 'LEXICAL_ERROR';

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

/** The v13 streams of `source` for `notation`, named as 2.0.1 names them. */
export function v13Streams(notation: RailroadNotation, source: string): Streams {
  const { bodyStart, view } = railroadView(source);
  const names = LANGIUM_NAMES[notation];
  const hidden = LANGIUM_HIDDEN[notation];
  const out: Streams = { tokens: [], hidden: [] };
  for (const t of railroadTokens(notation, source)) {
    const name = names[t.kind] ?? `kind ${t.kind}`;
    if (t.kind === Kind.Error) {
      // The text v12's lexer read before the error: v12's text, trimmed at its start.
      const before = cook(source, bodyStart, t.range.start, view).trimStart();
      out.tokens.push([ERROR, `@${before.length}`]);
      break;
    }
    (hidden.has(name) ? out.hidden : out.tokens).push([name, t.text]);
  }
  return out;
}

const show = (t: LangiumToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');

function firstDiff(a: LangiumToken[], b: LangiumToken[]): string | undefined {
  if (JSON.stringify(a) === JSON.stringify(b)) return undefined;
  let at = 0;
  while (JSON.stringify(a[at]) === JSON.stringify(b[at])) at++;
  const from = Math.max(0, at - 2);
  return `@${at}\n    v12 ${show(a.slice(from, at + 3))}\n    v13 ${show(b.slice(from, at + 3))}`;
}

export interface GateResult {
  /** The sources routed to the notation, with every variant. */
  routed: number;
  /** Of those, the ones v12's lexer for the notation read. */
  compared: number;
  /** Of those, the e2e fixtures as written (no variant). */
  e2e: number;
  /** Of those, the ones with a lexer error. */
  errors: number;
  /** Token or hidden-token differences, by id: empty when the gate holds. */
  diffs: string[];
  /** Listed exclusions that still differ (and are rejected by core's preprocess), by id. */
  excluded: string[];
  /** Listed exclusions that core's preprocess does not reject: each must be. */
  accepted: string[];
  /** Routed sources v12 never lexed as the notation, by id. */
  unreached: string[];
  /** Unrouted sources that v12 did lex as the notation: each must be routed. */
  strays: string[];
}

/**
 * Run the gate for `notation` over the gate corpus. `excluded` ids are not compared: each must
 * still differ, and be one core's preprocess rejects (an unclosed directive, the only listed
 * reason so far).
 */
export async function gateLexer(
  notation: RailroadNotation,
  excluded: ReadonlySet<string>
): Promise<GateResult> {
  const oracle = await loadLangiumLexerOracle(notation);
  const result: GateResult = {
    routed: 0,
    compared: 0,
    e2e: 0,
    errors: 0,
    diffs: [],
    excluded: [],
    accepted: [],
    unreached: [],
    strays: [],
  };
  for (const item of await railroadGateCorpus()) {
    const routed = notationOf(item.source);
    if (routed !== undefined && routed !== notation) continue;
    const lexed = await oracle.lex(item.source);
    if (routed === undefined) {
      if (lexed) result.strays.push(item.id);
      continue;
    }
    result.routed++;
    if (!lexed) {
      result.unreached.push(item.id);
      continue;
    }
    result.compared++;
    if (item.id.startsWith('e2e/') && item.variant === undefined) result.e2e++;
    if (lexed.errorAt !== undefined) result.errors++;
    const v12 = v12Streams(lexed);
    const v13 = v13Streams(notation, item.source);
    const tokens = firstDiff(v12.tokens, v13.tokens);
    const hidden = firstDiff(v12.hidden, v13.hidden);
    if (excluded.has(item.id)) {
      if (tokens ?? hidden) result.excluded.push(item.id);
      const unclosed = preprocess(item.source).diagnostics.some(
        (d) => d.code === 'UNCLOSED_DIRECTIVE' && d.severity === 'error'
      );
      if (!unclosed) result.accepted.push(item.id);
      continue;
    }
    if (tokens) result.diffs.push(`${item.id} tokens ${tokens}`);
    if (hidden) result.diffs.push(`${item.id} hidden ${hidden}`);
  }
  result.excluded.sort();
  result.unreached.sort();
  return result;
}
