/**
 * `@mermaid-js/diagram-packet`: the packet diagram plugin (spec #421). Imports
 * `@mermaid-js/core` subpaths only. T1 (#452): the lexer, gated token by token against v12's
 * Langium lexer. T2 (#454): the parser, the model, the AST and the checked config. T3 (#456):
 * the layout; its invariants, which only the gates read, are at `./testing`. T4 (#460): the SVG
 * renderer, packet's theme table and the `packet` plugin object. T7 (#464): text output, the
 * separate `./ascii` entry, loaded only for a text render.
 */
export { PACKET_TRIVIA, PacketTokenKind } from './parser/index.ts';
export type { PacketToken } from './parser/index.ts';
export {
  detectPacket,
  isWholeField,
  MAX_PACKET_ROWS,
  PACKET_SEMANTIC_ERRORS,
  parsePacket,
} from './parser/index.ts';
export type {
  PacketDocument,
  PacketFieldDrop,
  PacketFieldNode,
  PacketHeaderNode,
  PacketParseOptions,
  PacketParseResult,
  PacketStatementNode,
  PacketTextNode,
} from './parser/index.ts';
export type { PacketField, PacketModel, PacketPiece } from './model.ts';
export { PACKET_CONFIG_DEFAULTS, packetConfig, packetSectionOf } from './config.ts';
export type { PacketConfig, PacketConfigProblem } from './config.ts';
export { layoutPacket } from './layout/index.ts';
export type {
  BitNumber,
  PacketLayout,
  PacketLayoutContext,
  PacketPieceLayout,
  PacketRowLayout,
  PlacedLabel,
} from './layout/index.ts';
export { packet } from './plugin.ts';
export { renderPacket } from './render/index.ts';
export type { PacketRenderContext } from './render/index.ts';
