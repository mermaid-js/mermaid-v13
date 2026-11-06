/**
 * The gitGraph custom layout (spec #292 T3): `layoutGitGraph`, its result type and invariants,
 * and the metrics table and geometry variables it takes its lengths from.
 */
export { layoutGitGraph } from './layout.ts';
export type { GitLayoutContext } from './env.ts';
export { gitLayoutViolations, type ViolationOptions } from './invariants.ts';
export {
  GIT_GEOMETRY,
  GIT_METRICS,
  type GeometryVariable,
  type GitGeometry,
  type GitGeometryVariables,
  type GitMetrics,
} from './metrics.ts';
export type * from './types.ts';
