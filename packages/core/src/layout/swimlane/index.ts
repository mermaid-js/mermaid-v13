// `@mermaid-js/core/layout/swimlane` (D533, R-LAYOUT-8): the `swimlane` engine at its own subpath,
// never re-exported from `@mermaid-js/core/layout`, so `mermaid` loads it lazily and it stays out
// of the core budget's closure (R-PERF-8).
import type { LayoutEngine } from '../types.ts';
import { swimlaneLayout } from './swimlane.ts';

/**
 * Lanes (D531, D535): each top-level group is a lane, and nodes outside every group share a
 * default lane, `__swimlane_default__`. Nested groups are boxes inside their lane. Lanes run along
 * the diagram's direction and each reserves its title band inside its box: on top for TB/BT, on
 * the left for LR/RL (D536). Ported from v12's swimlane engine (D532). Spacing comes from
 * `graph.spacing`; the tuning from `ctx.config.swimlane`. Until the orthogonal router lands
 * (#595) edges are placeholder right-angled elbows (`stepped`). `availableWidth`, `minLen`,
 * `grid` and groups' own `direction` are not used; the model's direction is the graph's.
 */
export const swimlane: LayoutEngine = (graph, ctx) => swimlaneLayout(graph, ctx?.config?.swimlane);
