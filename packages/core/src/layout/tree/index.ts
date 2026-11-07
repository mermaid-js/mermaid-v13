// `@mermaid-js/core/layout/tree` (D280, R-LAYOUT-8): the `tree` engine at its own subpath, never
// re-exported from `@mermaid-js/core/layout`, so `mermaid` loads it lazily and it stays out of
// the core budget's closure (R-PERF-8).
import type { LayoutEngine } from '../types.ts';
import { layoutTree } from './tree.ts';

/**
 * A two-sided tidy tree (D281): the root in the middle, its first branches to the right and
 * the rest to the left (D283), each side a tidy tree whose levels run outwards. `spacing.rank`
 * is the gap from a parent to its children, `spacing.node` the gap between siblings. Input
 * that is not one tree is laid out as a spanning forest (D285). `direction`, `availableWidth`
 * and `routing` are not used; the model's direction is the graph's.
 */
export const tree: LayoutEngine = (graph) => layoutTree(graph);
