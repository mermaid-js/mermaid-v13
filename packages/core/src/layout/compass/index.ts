// `@mermaid-js/core/layout/compass` (D326, D327, R-LAYOUT-9): the `compass` engine at its own
// subpath, never re-exported from `@mermaid-js/core/layout`, so `mermaid` loads it lazily and it
// stays out of the core budget's closure (R-PERF-8).
import type { LayoutEngine } from '../types.ts';
import { layoutCompass } from './compass.ts';

/**
 * Grid placement from edge sides (D326, the reference implementation's `placeOnGrid`): `a:R -- L:b`
 * puts `b` in the cell to the right of `a`, `align` hints are placed first, then edges, then
 * like-side edges; each group is laid out alone and held as a rigid block. Cells are then sized
 * from the measured boxes and edge labels, and routes are orthogonal between the sides each edge
 * names. An edge without `sides` takes them from `direction` (`LR` gives right to left, `TB` bottom
 * to top), so any graph lays out (D327). `spacing`, `routing`, `availableWidth` and `grid` are not
 * used; the model's direction is the graph's. Deterministic by construction.
 */
export const compass: LayoutEngine = (graph) => layoutCompass(graph);
