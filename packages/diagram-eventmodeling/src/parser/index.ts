/**
 * The event modeling parser's public surface: the parser, the model and detection (#602), and
 * the lexer gated against v12's Langium lexer (#600).
 */
import { seenTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';
import { eventModelingView } from './view.ts';

export { eventModelingView } from './view.ts';
export type { EventModelingView } from './view.ts';
export { parseEventModel } from './parser.ts';
export type { EventModelParseOptions, EventModelParseResult } from './parser.ts';
export { detectEventModeling } from './detect.ts';
export type * from './ast.ts';

export { EVENTMODELING_TRIVIA, T as EventModelingTokenKind, LANGIUM_NAMES } from './tokens.ts';

/** A token of this diagram: its `kind` is an `EventModelingTokenKind` or a shared `Kind`. */
export type EventModelingToken = SeenToken;

/**
 * The tokens of `src` that v12's lexer saw, in order: significant tokens, the hidden comments,
 * directives and YAML blocks in the text v12 lexed (`%%` comment lines included), and `Error` where no rule matched
 * (one token over the skipped characters; lexing goes on). Whitespace writes no token (v12
 * skipped it). The spans v12 removed before lexing (comment lines, directives) are left out,
 * and so is the final `EOF`.
 */
export function eventModelingTokens(src: string): EventModelingToken[] {
  const { bodyStart, view } = eventModelingView(src);
  const stream = lex(src, bodyStart, view);
  return seenTokens(src, stream, view);
}
