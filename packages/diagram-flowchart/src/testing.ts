/**
 * Test-only entry (`@mermaid-js/diagram-flowchart/testing`): internals other packages' specs
 * compare against. The class renderer carries a copy of `routePath` (packages never import
 * each other); conformance checks the two draw the same paths. `shapeNames` lists every
 * `@{ shape }` name, so a spec can draw them all.
 */
export { curveKind, routePath, type CurveKind, type EdgePath } from './render/edges.ts';
export { shapeNames } from './parser/shapes.ts';
