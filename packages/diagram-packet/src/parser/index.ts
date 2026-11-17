/**
 * The packet parser's public surface: the parser (#454), detection, and the lexer gated against
 * v12's Langium lexer (#452).
 */
import { bodyTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { PACKET_TRIVIA, T as PacketTokenKind } from './tokens.ts';
export { PACKET_SEMANTIC_ERRORS, parsePacket } from './parser.ts';
export { isWholeField, MAX_PACKET_ROWS } from '../normalise.ts';
export type { PacketParseOptions, PacketParseResult } from './parser.ts';
export { detectPacket } from './detect.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is a `PacketTokenKind` or a shared `Kind`. */
export type PacketToken = SeenToken;

/**
 * The tokens of `src` that v12's lexer saw, in order: significant tokens, the hidden comments,
 * directives and YAML blocks still in the text v12 lexed, and `Error` where no rule matched.
 * The spans v12 removed before lexing (comment lines, directives) are left out, and so is the
 * final `EOF`. The last `Newline` is the zero-width one at the end of the source, for the line
 * break v12 appended.
 */
export function packetTokens(src: string): PacketToken[] {
  return bodyTokens(src, lex);
}
