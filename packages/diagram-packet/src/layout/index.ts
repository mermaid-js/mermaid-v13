/**
 * The packet custom layout (spec #421 T3): `layoutPacket`, its result type and its invariants,
 * and the metrics table it takes its lengths from.
 */
export { layoutPacket, type PacketLayoutContext } from './layout.ts';
export { packetLayoutViolations } from './invariants.ts';
export { PACKET_METRICS, PACKET_THEME_DEFAULTS } from './metrics.ts';
export type { PacketMetrics } from './metrics.ts';
export type * from './types.ts';
