/**
 * The sankey custom layout (spec #427 T3): `layoutSankey` and its result type, and its
 * invariants (for the conformance corpus).
 */
export { layoutSankey, type SankeyLayoutContext } from './layout.ts';
export { sankeyLayoutViolations } from './invariants.ts';
export type * from './types.ts';
