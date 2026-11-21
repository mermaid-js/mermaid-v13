/**
 * The block parser's public surface: the parser, detection, and the lexer gated against v12's
 * jison lexer.
 */
import { TRIVIA } from '@mermaid-js/core/parser-kit';
import { bodyView, keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { JISON_NAMES, T as BlockTokenKind } from './tokens.ts';
export { MAX_SPACE_CELLS, MAX_SPAN } from './builder.ts';
export { parseBlock } from './parser.ts';
export type { BlockParseOptions, BlockParseResult } from './parser.ts';
export { detectBlock } from './detect.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is a `BlockTokenKind` or a shared `Kind`. */
export type BlockToken = SeenToken;

/**
 * The significant block tokens of `src` (trivia left out), for editors and for the
 * lexer-parity gate.
 */
export function blockTokens(src: string): BlockToken[] {
  const { bodyStart, view } = bodyView(src);
  const lexed = lex(src, bodyStart, view);
  return keptTokens(lexed.tokens, TRIVIA, (j) => lexed.text(j));
}
