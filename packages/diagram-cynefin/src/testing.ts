/**
 * `@mermaid-js/diagram-cynefin/testing`: what the conformance gates read and a render never
 * does: v12's Langium token names, the token streams (also verbatim) and the trivia set (#461);
 * the layout invariants and v12's boundary generator as points and as path data (#467). They
 * live outside the runtime entry, which mermaid loads for every cynefin render, so that chunk
 * stays small (D217).
 */
export {
  CYNEFIN_TRIVIA,
  CynefinTokenKind,
  cynefinTokens,
  cynefinVerbatimTokens,
  LANGIUM_NAMES,
  lexCynefin,
} from './parser/index.ts';
export type { CynefinLexed, CynefinToken } from './parser/index.ts';
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
