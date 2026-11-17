/**
 * The info parser's public surface: the parser, detection, and the lexer gated against v12's
 * Langium lexer.
 */
import { bodyTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { INFO_TRIVIA, LANGIUM_NAMES, T as InfoTokenKind } from './tokens.ts';
export { parseInfo } from './parser.ts';
export type { InfoParseOptions, InfoParseResult } from './parser.ts';
export { detectInfo } from './detect.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is an `InfoTokenKind` or a shared `Kind`. */
export type InfoToken = SeenToken;

/**
 * The tokens of `src` that v12's lexer saw, in order: significant tokens, the hidden comments,
 * directives and YAML blocks still in the text v12 lexed, and `Error` where no rule matched.
 * The spans v12 removed before lexing (comment lines, directives) are left out, and so is the
 * final `EOF`. The last `Newline` is the zero-width one at the end of the source, for the line
 * break v12 appended.
 */
export function infoTokens(src: string): InfoToken[] {
  return bodyTokens(src, lex);
}
