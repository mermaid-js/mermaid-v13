/**
 * The gantt parser's public surface: the parser, detection, and the lexer gated against v12's
 * jison lexer (#377).
 */
import { significantTokens, TRIVIA } from '@mermaid-js/core/parser-kit';
import { bodyView, cooked, keptTokens, NO_KINDS } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { JISON_NAMES, T as GanttTokenKind } from './tokens.ts';
export { parseGantt } from './parser.ts';
export type { GanttParseOptions, GanttParseResult } from './parser.ts';
export { detectGantt } from './detect.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is a `GanttTokenKind` or a shared `Kind`. */
export type GanttToken = SeenToken;

/**
 * The significant gantt tokens of `src` (trivia left out), for editors and for the lexer-parity
 * gate.
 */
export function ganttTokens(src: string): GanttToken[] {
  const { bodyStart, view } = bodyView(src);
  const t = significantTokens(lex(src, bodyStart, view), TRIVIA);
  return keptTokens(t, NO_KINDS, cooked(src, t, view));
}
