/**
 * The sequence parser's public surface: the parser, detection, and the lexer gated against
 * v12's jison lexer.
 */
import { bodyView, COMMENTS, cooked, keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { JISON_NAMES, T as SequenceTokenKind } from './tokens.ts';
export { parseSequence } from './parser.ts';
export type { SequenceParseOptions, SequenceParseResult } from './parser.ts';
export { detectSequence } from './detect.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is a `SequenceTokenKind` or a shared `Kind`. */
export type SequenceToken = SeenToken;

/**
 * The significant sequence tokens of `src` (comments and directives left out), for editors
 * and for the lexer-parity gate.
 */
export function sequenceTokens(src: string): SequenceToken[] {
  const { bodyStart, view } = bodyView(src);
  const stream = lex(src, bodyStart, view);
  return keptTokens(stream, COMMENTS, cooked(src, stream, view));
}
