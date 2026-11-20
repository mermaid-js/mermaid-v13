/**
 * The ishikawa parser's public surface: the parser, detection, and the lexer gated against
 * v12's jison lexer.
 */
import { TRIVIA } from '@mermaid-js/core/parser-kit';
import { bodyView, keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { JISON_NAMES, T as IshikawaTokenKind } from './tokens.ts';
export { parseIshikawa } from './parser.ts';
export type { IshikawaParseOptions, IshikawaParseResult } from './parser.ts';
export { detectIshikawa } from './detect.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is an `IshikawaTokenKind` or a shared `Kind`. */
export type IshikawaToken = SeenToken;

/**
 * The significant ishikawa tokens of `src` (trivia left out), for editors and for the
 * lexer-parity gate.
 */
export function ishikawaTokens(src: string): IshikawaToken[] {
  const { bodyStart, view } = bodyView(src);
  const lexed = lex(src, bodyStart, view);
  return keptTokens(lexed.tokens, TRIVIA, (j) => lexed.text(j));
}
