/**
 * The cynefin parser's public surface: the lexer, gated against v12's Langium lexer (T1, #461),
 * and the parser, detection and AST (T2, #465).
 */
import type { SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { bodyView, keptTokens, NO_KINDS, seenTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { LANGIUM_NAMES, T as CynefinTokenKind } from './tokens.ts';
export { parseCynefin } from './parser.ts';
export type { CynefinParseOptions, CynefinParseResult } from './parser.ts';
export { detectCynefin } from './detect.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is a `CynefinTokenKind` or a shared `Kind`. */
export type CynefinToken = SeenToken;

export interface CynefinLexed {
  /** Core's preprocess of the source (front matter, directives, where the body starts). */
  pre: PreprocessResult;
  /** The source view: the text v12 lexed, with the spans v12 removed as holes. */
  view: SourceView;
  /** The lexer's tokens, with source ranges (trivia included, then `EOF`). */
  stream: TokenStream;
}

/**
 * Lex a whole source as the parser does: core's preprocess and the source view of the body
 * ({@link bodyView}), then the cynefin lexer over it. The one stream setup the parser (T2), the tokens
 * below and the gates share.
 */
export function lexCynefin(src: string): CynefinLexed {
  const { pre, view } = bodyView(src);
  return { pre, view, stream: lex(src, pre.bodyStart, view) };
}

/**
 * The tokens of `src` that v12's lexer saw, in order: significant tokens, the hidden comments,
 * directives and YAML blocks still in the text v12 lexed, and `Error` where no rule matched.
 * The spans v12 removed before lexing (comment lines, directives) are left out, and so is the
 * final `EOF`. The last `Newline` is the zero-width one at the end of the source, for the line
 * break v12 appended.
 */
export function cynefinTokens(src: string): CynefinToken[] {
  const { view, stream } = lexCynefin(src);
  return seenTokens(src, stream, view);
}

/**
 * The tokens of `text` lexed verbatim, as Chevrotain lexes a text handed to it directly: no
 * preprocessing, so comment lines and directives are hidden tokens; no line break appended and
 * no leading blanks trimmed. Each token's text is its source slice. For the gate over v12's
 * spec strings, which reached v12's parser raw (#461).
 */
export function cynefinVerbatimTokens(text: string): CynefinToken[] {
  const view: SourceView = {
    mask: undefined,
    holes: [],
    text,
    runs: undefined,
    braceNewline: false,
  };
  const stream = lex(text, 0, view, { verbatim: true });
  return keptTokens(stream, NO_KINDS, (j) => text.slice(stream.start[j] ?? 0, stream.end[j] ?? 0));
}
