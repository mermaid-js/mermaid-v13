/**
 * The wardley parser's public surface: the parser (#489), detection, and the lexer gated against
 * v12's Langium lexer (#487).
 */
import type { SourceView } from '@mermaid-js/core/parser-kit';
import { bodyTokens, bodyView } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { LANGIUM_NAMES, T as WardleyTokenKind, WARDLEY_TRIVIA } from './tokens.ts';
export { parseWardley } from './parser.ts';
export type { WardleyParseOptions } from './options.ts';
export type { WardleyParseResult } from './parser.ts';
export { detectWardley } from './detect.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is a `WardleyTokenKind` or a shared `Kind`. */
export type WardleyToken = SeenToken;

/** Where v12's text starts in `src` (after front matter), and the view of that text. */
export interface WardleyView {
  bodyStart: number;
  view: SourceView;
}

/**
 * `src` as v12's wardley lexer read it: core's preprocess (front matter, directives) and the
 * source view over the body with default options (v12 ran every shared rewrite).
 */
export function wardleyView(src: string): WardleyView {
  return bodyView(src);
}

/**
 * The tokens of `src` that v12's lexer saw, in order: significant tokens, the hidden comments,
 * directives and YAML blocks still in the text v12 lexed, and `Error` where no rule matched.
 * The spans v12 removed before lexing (comment lines, directives) are left out, and so is the
 * final `EOF`. The last `Newline` is the zero-width one at the end of the source, for the line
 * break v12 appended.
 */
export function wardleyTokens(src: string): WardleyToken[] {
  return bodyTokens(src, lex);
}
