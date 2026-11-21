/**
 * The usecase parser's public surface: the parser, model builder and AST (#563), detection, and
 * the lexer gated against v12's Chevrotain lexer (#562).
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type { Range, SourceView } from '@mermaid-js/core/parser-kit';
import { decodePlaceholders } from '@mermaid-js/core/parser-kit/support';
import { bodyView } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { lex, lexText } from './lexer.ts';
export { parseUsecase } from './parser.ts';
export type { UsecaseParseOptions, UsecaseParseResult } from './parser.ts';
export { detectUsecase } from './detect.ts';
export { parseOrderedJson, jsonRows } from './json.ts';
export type { JsonProblem, OrderedJson } from './json.ts';
export type * from './ast.ts';
export type { Lexed, LexText } from './lexer.ts';
export {
  ANY_CASE,
  CHEVROTAIN_NAMES,
  KEYWORDS,
  LABEL_TEXT,
  T as UsecaseTokenKind,
  WORD,
} from './tokens.ts';

export interface UsecaseToken {
  /** A `UsecaseTokenKind` or a shared `Kind`. */
  kind: number;
  /**
   * The token's text as v12's lexer read it, with entity placeholders decoded to `&name;` /
   * `&#123;` as v12's renderer did: CRLF and CR as LF, removed spans cut out, tag quotes as
   * `'`. The line break v12 appended is not part of any text.
   */
  text: string;
  range: Range;
  /** Where the token starts in the text v12 lexed (`lexText(…).text`). */
  at: number;
}

/** Where v12's text starts in `src` (after front matter), and the view of that text. */
export interface UsecaseView {
  bodyStart: number;
  view: SourceView;
}

/**
 * `src` as v12's usecase lexer read it: core's preprocess (front matter, directives) and the
 * source view over the body with default options (v12 ran every shared rewrite).
 */
export function usecaseView(src: string): UsecaseView {
  const { bodyStart, view } = bodyView(src);
  return { bodyStart, view };
}

/**
 * The tokens of `src` that v12's lexer saw, in order: the tokens, `COMMENT` (a `%%` line v12
 * left) as `Kind.Comment`, and `Kind.Error` where no rule matched (one token over the skipped
 * characters, then lexing goes on). The spans v12 removed before lexing (comment lines,
 * directives) are left out, and so is the final `EOF`. The last `Newline` is the zero-width
 * one at the end of the source, for the line break v12 appended.
 *
 * Not `keptTokens` from `@mermaid-js/shared/parser/seen-tokens`: each token also carries `at`,
 * its index into the text v12 lexed, which the shared `SeenToken` does not have. A per-token
 * builder in the shared helper for this one list would cost more than the loop (#907).
 */
export function usecaseTokens(src: string): UsecaseToken[] {
  const { bodyStart, view } = usecaseView(src);
  const { tokens, input, at, to } = lex(src, bodyStart, view);
  const last = input.text.length - 1;
  const out: UsecaseToken[] = [];
  for (let j = 0; j < tokens.length; j++) {
    const kind = tokens.kind[j] ?? Kind.EOF;
    const s = at[j] ?? -1;
    // EOF, and the spans v12 removed before lexing: its lexer never saw them.
    if (kind === Kind.EOF || s < 0) continue;
    const e = Math.min(to[j] ?? s, last);
    out.push({
      kind,
      text: decodePlaceholders(input.text.slice(s, Math.max(s, e))),
      range: { start: tokens.start[j] ?? 0, end: tokens.end[j] ?? 0 },
      at: s,
    });
  }
  return out;
}
