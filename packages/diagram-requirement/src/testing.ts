/**
 * Test-only entry (`@mermaid-js/diagram-requirement/testing`): the renderer's harness, for the
 * package's specs; `routePath`, a copy of the flowchart's (packages never import each other),
 * which conformance keeps equal to it; and the layout and its marker metrics, for conformance's
 * layout invariants.
 */
export { renderRequirementForTest, TEST_VERSION } from './render/harness.ts';
export type { RenderedRequirement, RenderRequirementOptions } from './render/harness.ts';
export { routePath, type CurveKind, type EdgePath } from './render/route.ts';
export {
  CLASSIC_MARKERS,
  layoutRequirement,
  markerGeometry,
  markerRoom,
  REQUIREMENT_METRICS,
} from './layout/index.ts';
export type { MarkerExtent, MarkerGeometry } from './layout/index.ts';
