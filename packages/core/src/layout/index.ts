/**
 * Shared layout contract for graph diagrams and the default `layered` engine (DESIGN §6).
 */
export type {
  Box,
  Dir,
  EdgeRouting,
  EndMarker,
  LayoutContext,
  LayoutEdge,
  LayoutEngine,
  LayoutGraph,
  LayoutGroup,
  LayoutModel,
  LayoutModelEdge,
  LayoutModelGroup,
  LayoutModelNode,
  LayoutNode,
  LayoutSpacing,
  Point,
  RoutePoint,
  Side,
  Size,
} from './types.ts';
export {
  layered,
  layoutSettings,
  TURN_BREAKPOINT,
  V12_SPACING,
  type SpacingConfig,
} from './layered/index.ts';
export { countCrossings, validateLayout } from './validate.ts';
export { validateGrid } from './validate-grid.ts';
export {
  cellProfile,
  fromPx,
  pxProfile,
  type BuilderMetrics,
  type CellPadding,
  type LayoutMetrics,
  type UnitProfile,
} from './units.ts';
