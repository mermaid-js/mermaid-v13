/**
 * The sankey parser's public surface: the parser, detection, and the lexer gated against v12's
 * jison lexer.
 */
import { TRIVIA } from '@mermaid-js/core/parser-kit';
import { bodyView, keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { JISON_NAMES, SankeyKind as SankeyTokenKind } from './tokens.ts';
export { parseSankey } from './parser.ts';
export type { SankeyParseOptions, SankeyParseResult } from './parser.ts';
export { detectSankey } from './detect.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is a `SankeyTokenKind` or a shared `Kind`. */
export type SankeyToken = SeenToken;

/**
 * The significant sankey tokens of `src` (trivia left out), for editors and for the
 * lexer-parity gate.
 */
export function sankeyTokens(src: string): SankeyToken[] {
  const { bodyStart, view } = bodyView(src);
  const lexed = lex(src, bodyStart, view);
  return keptTokens(lexed.tokens, TRIVIA, (j) => lexed.text(j));
}
