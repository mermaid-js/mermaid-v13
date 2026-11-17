/**
 * The railroad parser's public surface: the four parsers (#610), detection, and the four lexers
 * (#608), each gated against its notation's v12 Langium lexer.
 */
import type { SourceView } from '@mermaid-js/core/parser-kit';
import { bodyTokens, bodyView } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { LEXERS } from './lexers.ts';
import type { RailroadNotation } from './tokens.ts';

export { RAILROAD_TRIVIA, T as RailroadTokenKind } from './tokens.ts';
export type { RailroadNotation } from './tokens.ts';
export { parseRailroad } from './parse.ts';
export { RULE_SYMBOL } from './parser.ts';
export type { RailroadParseOptions, RailroadParseResult } from './parser.ts';
export { detectRailroad, RAILROAD_HEADERS } from './detect.ts';
export type * from './ast.ts';

export { LEXERS } from './lexers.ts';

/** A token of this diagram: its `kind` is a `RailroadTokenKind` or a shared `Kind`. */
export type RailroadToken = SeenToken;

/** Where v12's text starts in `src` (after front matter), and the view of that text. */
export interface RailroadView {
  bodyStart: number;
  view: SourceView;
}

/**
 * `src` as v12's railroad lexers read it: core's preprocess (front matter, directives) and the
 * source view over the body with default options (v12 ran every shared rewrite).
 */
export function railroadView(src: string): RailroadView {
  return bodyView(src);
}

/**
 * The tokens of `src` that v12's lexer for `notation` saw, in order: significant tokens, the
 * hidden comments, directives and YAML blocks still in the text v12 lexed, and `Error` where no
 * rule matched. The spans v12 removed before lexing (comment lines, directives) are left out,
 * and so is the final `EOF`. Whitespace writes no token.
 */
export function railroadTokens(notation: RailroadNotation, src: string): RailroadToken[] {
  return bodyTokens(src, LEXERS[notation]);
}
