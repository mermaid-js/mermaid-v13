/**
 * The event modeling parser's public surface: the parser, the model and detection (#602), and
 * the lexer gated against v12's Langium lexer (#600).
 */
import { cook, Kind } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { lex } from './lexer.ts';
import { eventModelingView } from './view.ts';

export { eventModelingView } from './view.ts';
export type { EventModelingView } from './view.ts';
export { parseEventModel } from './parser.ts';
export type { EventModelParseOptions, EventModelParseResult } from './parser.ts';
export { detectEventModeling } from './detect.ts';
export type * from './ast.ts';

export { EVENTMODELING_TRIVIA, T as EventModelingTokenKind, LANGIUM_NAMES } from './tokens.ts';

export interface EventModelingToken {
  /** An `EventModelingTokenKind` or a shared `Kind`. */
  kind: number;
  /**
   * The token's text as v12's lexer read it: CRLF and CR as LF, removed spans cut out, tag
   * quotes as `'`, entities decoded to `&name;` as v12's renderer did.
   */
  text: string;
  range: Range;
}

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
  const removed = view.holes.filter((h) => h.kind !== 'drop');
  let h = 0;
  const out: EventModelingToken[] = [];
  for (let j = 0; j < stream.length; j++) {
    const kind = stream.kind[j] ?? Kind.EOF;
    const start = stream.start[j] ?? 0;
    const end = stream.end[j] ?? 0;
    if (kind === Kind.EOF) continue;
    while ((removed[h]?.start ?? Infinity) < start) h++;
    const hole = removed[h];
    const trivia = kind === Kind.Comment || kind === Kind.Directive;
    // A span v12 removed before lexing: its lexer never saw it.
    if (trivia && hole?.start === start && hole.end === end) continue;
    out.push({ kind, text: cook(src, start, end, view), range: { start, end } });
  }
  return out;
}
