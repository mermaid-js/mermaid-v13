/**
 * Test-only entry (`@mermaid-js/diagram-requirement/testing`): the renderer's harness, for the
 * package's specs and the corpus render properties in conformance, and `routePath`, a copy of
 * the flowchart's (packages never import each other), which conformance keeps equal to it.
 */
export { renderRequirementForTest, TEST_VERSION } from './render/harness.ts';
export type { RenderedRequirement, RenderRequirementOptions } from './render/harness.ts';
export { routePath, type CurveKind, type EdgePath } from './render/route.ts';
