/**
 * The architecture parser's public surface: the parser (#599), detection, and the lexer gated
 * against v12's Langium lexer (#594).
 */
import { bodyTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { ARCHITECTURE_TRIVIA, LANGIUM_NAMES, T as ArchitectureTokenKind } from './tokens.ts';
export { parseArchitecture } from './parser.ts';
export type { ArchitectureParseOptions, ArchitectureParseResult } from './parser.ts';
export { detectArchitecture } from './detect.ts';
export type * from './ast.ts';

export type ArchitectureToken = SeenToken;

/**
 * The tokens of `src` that v12's lexer saw, in order: significant tokens, the hidden comments,
 * directives and YAML blocks still in the text v12 lexed, and `Error` where no rule matched.
 * The spans v12 removed before lexing (comment lines, directives) are left out, and so is the
 * final `EOF`. The last `Newline` is the zero-width one at the end of the source, for the line
 * break v12 appended.
 */
export function architectureTokens(src: string): ArchitectureToken[] {
  return bodyTokens(src, lex);
}
