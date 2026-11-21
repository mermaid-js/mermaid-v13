/**
 * The venn parser's public surface: the parser, detection, and the lexer gated against v12's
 * jison lexer.
 */
import { TRIVIA } from '@mermaid-js/core/parser-kit';
import { bodyView, keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { JISON_NAMES, T as VennTokenKind } from './tokens.ts';
export { parseVenn } from './parser.ts';
export type { VennParseOptions, VennParseResult } from './parser.ts';
export { detectVenn } from './detect.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is a `VennTokenKind` or a shared `Kind`. */
export type VennToken = SeenToken;

/**
 * The significant venn tokens of `src` (trivia left out), for editors and for the
 * lexer-parity gate.
 */
export function vennTokens(src: string): VennToken[] {
  const { bodyStart, view } = bodyView(src);
  const lexed = lex(src, bodyStart, view);
  return keptTokens(lexed.tokens, TRIVIA, (j) => lexed.text(j));
}
