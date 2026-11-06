/**
 * `@mermaid-js/diagram-cynefin/testing`: what the conformance gates read and a render never
 * does: the layout invariants, and v12's boundary generator as points and as path data. They
 * live outside the runtime entry, so that chunk stays small (D217).
 */
export {
  cliffCurve,
  confusionEllipse,
  curveData,
  cynefinLayoutViolations,
  ellipseData,
  foldCurve,
  hashString,
  horizonCurve,
  resolveSeed,
  seededRandom,
} from './layout/index.ts';
