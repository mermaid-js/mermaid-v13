/**
 * The block custom layout (spec #521 T3): `layoutBlock` and its result type, the grid it is
 * built on, and the metrics table. The invariants are in the package's `./testing` entry.
 */
export { blockPadding, layoutBlock, type BlockLayoutContext } from './layout.ts';
export { gridPosition, placeGrid, sizeGrid, type GridNode } from './grid.ts';
export { BLOCK_METRICS } from './metrics.ts';
export type * from './types.ts';
