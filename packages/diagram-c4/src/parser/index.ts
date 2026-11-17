/**
 * The C4 parser's public surface: the parser, detection, and the lexer gated against v12's
 * jison lexer.
 */
import { TRIVIA } from '@mermaid-js/core/parser-kit';
import { bodyView, cooked, keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { JISON_NAMES, T as C4TokenKind } from './tokens.ts';
export { parseC4 } from './parser.ts';
export type { C4ParseOptions, C4ParseResult } from './parser.ts';
export { detectC4 } from './detect.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is a `C4TokenKind` or a shared `Kind`. */
export type C4Token = SeenToken;

/**
 * The significant C4 tokens of `src` (trivia left out: comments, directives, skipped blanks
 * and the final `Kind.EOF`), for editors and for the lexer-parity gate.
 */
export function c4Tokens(src: string): C4Token[] {
  const { bodyStart, view } = bodyView(src);
  const tokens = lex(src, bodyStart, view);
  return keptTokens(tokens, TRIVIA, cooked(src, tokens, view));
}
