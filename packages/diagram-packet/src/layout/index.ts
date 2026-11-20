/**
 * The packet custom layout (spec #421 T3): `layoutPacket`, its result type and the metrics table it
 * takes its lengths from.
 */
export { layoutPacket, type PacketLayoutContext } from './layout.ts';
export { PACKET_METRICS } from './metrics.ts';
export type { PacketMetrics } from './metrics.ts';
export type * from './types.ts';
