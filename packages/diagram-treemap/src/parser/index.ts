/**
 * The treemap parser's public surface: the parser (#484), detection, and the lexer gated against
 * v12's Langium lexer (#483).
 */
import { bodyTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { LANGIUM_NAMES, TREEMAP_TRIVIA, T as TreemapTokenKind } from './tokens.ts';
export {
  parseTreemap,
  TREEMAP_CLASSDEF_NEXT_LINE,
  TREEMAP_ROWS_ON_ONE_LINE,
  TREEMAP_TRAILING_BLANK,
} from './parser.ts';
export type { TreemapParseOptions, TreemapParseResult } from './parser.ts';
export { TREEMAP_INVALID_VALUE } from './normalise.ts';
export { detectTreemap } from './detect.ts';
export type * from './ast.ts';

export type TreemapToken = SeenToken;

/**
 * The tokens of `src` that v12's lexer saw, in order: significant tokens, the line breaks
 * (skipped by v12's lexer), the `%%` comments still in the text v12 lexed, and `Error` where no
 * rule matched. The spans v12 removed before lexing (comment lines, directives) are left out,
 * and so is the final `EOF`. The last `Newline` is the zero-width one at the end of the source,
 * for the line break v12 appended.
 */
export function treemapTokens(src: string): TreemapToken[] {
  return bodyTokens(src, lex);
}
