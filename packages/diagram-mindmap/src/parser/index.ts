/**
 * The mindmap parser's public surface: the parser, detection, and the lexer gated against v12's
 * jison lexer.
 */
import { TRIVIA } from '@mermaid-js/core/parser-kit';
import { bodyView, cooked, keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { JISON_NAMES, T as MindmapTokenKind } from './tokens.ts';
export { parseMindmap } from './parser.ts';
export type { MindmapParseOptions, MindmapParseResult } from './parser.ts';
export { detectMindmap } from './detect.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is a `MindmapTokenKind` or a shared `Kind`. */
export type MindmapToken = SeenToken;

/**
 * The significant mindmap tokens of `src` (trivia left out), for editors and for the
 * lexer-parity gate.
 */
export function mindmapTokens(src: string): MindmapToken[] {
  const { bodyStart, view } = bodyView(src);
  const stream = lex(src, bodyStart, view);
  return keptTokens(stream, TRIVIA, cooked(src, stream, view));
}
