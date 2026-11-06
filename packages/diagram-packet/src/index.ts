/**
 * `@mermaid-js/diagram-packet`: the packet diagram plugin (spec #421). Imports
 * `@mermaid-js/core` subpaths only. T1 (#452): the lexer, gated token by token against v12's
 * Langium lexer; its token kinds and trivia set are what the parser (T2) reads.
 */
export { PACKET_TRIVIA, PacketTokenKind } from './parser/index.ts';
export type { PacketToken } from './parser/index.ts';
