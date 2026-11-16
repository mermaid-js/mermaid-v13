/**
 * The timeline parser's public surface: the parser, detection, and the lexer gated against
 * v12's jison lexer.
 */
import { bodyView, cooked, keptTokens, TRIVIA_KINDS } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { JISON_NAMES, T as TimelineTokenKind } from './tokens.ts';
export { parseTimeline } from './parser.ts';
export type { TimelineParseOptions, TimelineParseResult } from './parser.ts';
export { detectTimeline } from './detect.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is a `TimelineTokenKind` or a shared `Kind`. */
export type TimelineToken = SeenToken;

/**
 * The significant timeline tokens of `src` (trivia left out), for editors
 * and for the lexer-parity gate.
 */
export function timelineTokens(src: string): TimelineToken[] {
  const { bodyStart, view } = bodyView(src);
  const stream = lex(src, bodyStart, view);
  return keptTokens(stream, TRIVIA_KINDS, cooked(src, stream, view));
}
