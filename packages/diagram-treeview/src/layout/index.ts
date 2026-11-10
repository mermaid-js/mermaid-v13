/**
 * The treeView custom layout (spec #518 T3): `layoutTreeView` and its result type, and its
 * invariants (also at `./testing`).
 */
export { layoutTreeView, type TreeViewLayoutContext } from './layout.ts';
export { TREEVIEW_METRICS } from './metrics.ts';
export type * from './types.ts';
export type { TreeViewMetrics } from './metrics.ts';
export { treeViewLayoutViolations } from './invariants.ts';
