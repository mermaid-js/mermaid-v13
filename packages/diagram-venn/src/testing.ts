/**
 * `@mermaid-js/diagram-venn/testing`: what the conformance gates read and a render never does
 * (as radar's): the layout invariants, the test context, and the solver itself, for parity with
 * venn.js. They live outside the runtime entry, so the chunk mermaid loads for a venn render
 * stays small (D217).
 */
export { vennLayoutViolations } from './layout/invariants.ts';
export { vennTestContext, vennTestTheme } from './test-context.ts';
export {
  addMissingAreas,
  areaKey,
  intersectionAreaPath,
  lossFunction,
  seededRandom,
  solveVenn,
  VENN_SEED,
} from './solver/index.ts';
export type {
  Area,
  Circle,
  RegionPath,
  SetCircle,
  Solved,
  SolveBox,
  TextCentre,
} from './solver/index.ts';
