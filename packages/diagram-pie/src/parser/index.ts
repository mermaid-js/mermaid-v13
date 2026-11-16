/**
 * The pie parser's public surface: the parser (#305), detection, and the lexer gated against
 * v12's Langium lexer (#304).
 */
import { bodyTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { LANGIUM_NAMES, PIE_TRIVIA, T as PieTokenKind } from './tokens.ts';
export { parsePie } from './parser.ts';
export type { PieParseOptions, PieParseResult } from './parser.ts';
export { detectPie } from './detect.ts';
export type * from './ast.ts';

export type PieToken = SeenToken;

/**
 * The tokens of `src` that v12's lexer saw, in order: significant tokens, the hidden comments,
 * directives and YAML blocks still in the text v12 lexed, and `Error` where no rule matched.
 * The spans v12 removed before lexing (comment lines, directives) are left out, and so is the
 * final `EOF`. The last `Newline` is the zero-width one at the end of the source, for the line
 * break v12 appended.
 */
export function pieTokens(src: string): PieToken[] {
  return bodyTokens(src, lex);
}
