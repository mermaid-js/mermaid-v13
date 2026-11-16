/**
 * The kanban parser's public surface: the parser, detection, and the lexer gated against v12's
 * jison lexer.
 */
import { TRIVIA } from '@mermaid-js/core/parser-kit';
import { bodyView, keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { JISON_NAMES, T as KanbanTokenKind } from './tokens.ts';
export { parseKanban } from './parser.ts';
export type { KanbanParseOptions, KanbanParseResult } from './parser.ts';
export { detectKanban } from './detect.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is a `KanbanTokenKind` or a shared `Kind`. */
export type KanbanToken = SeenToken;

/**
 * The significant kanban tokens of `src` (trivia left out), for editors and for the
 * lexer-parity gate.
 */
export function kanbanTokens(src: string): KanbanToken[] {
  const { bodyStart, view } = bodyView(src);
  const lexed = lex(src, bodyStart, view);
  return keptTokens(lexed.tokens, TRIVIA, (j) => lexed.text(j));
}
