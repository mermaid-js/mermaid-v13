/**
 * `@mermaid-js/diagram-packet/testing`: what the conformance gates read and a render never
 * does: v12's Langium token names, the token stream and the layout invariants (#456). They live outside the runtime entry,
 * which mermaid loads for every packet render, so that chunk stays small (D217).
 */
export { LANGIUM_NAMES, PACKET_TRIVIA, PacketTokenKind, packetTokens } from './parser/index.ts';
export type { PacketToken } from './parser/index.ts';
export { packetLayoutViolations } from './layout/index.ts';
