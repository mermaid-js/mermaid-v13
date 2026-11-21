/**
 * The journey parser's public surface: the parser and its AST (T2), detection, and the lexer
 * gated against v12's jison lexer (T1).
 */
import { bodyView, COMMENTS, cooked, keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { JISON_NAMES, T as JourneyTokenKind } from './tokens.ts';
export { parseJourney } from './parser.ts';
export type { JourneyParseOptions, JourneyParseResult } from './parser.ts';
export { detectJourney } from './detect.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is a `JourneyTokenKind` or a shared `Kind`. */
export type JourneyToken = SeenToken;

/**
 * The significant journey tokens of `src` (comments and directives left out), for editors and
 * for the lexer-parity gate.
 */
export function journeyTokens(src: string): JourneyToken[] {
  const { bodyStart, view } = bodyView(src);
  const stream = lex(src, bodyStart, view);
  return keptTokens(stream, COMMENTS, cooked(src, stream, view));
}
