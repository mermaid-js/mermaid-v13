/**
 * The wardley custom layout (spec #430 T3): `layoutWardley`, its result type and its invariants.
 * The renderer reads the strokes and dashes from `metrics.ts`.
 */
export { layoutWardley, type WardleyLayoutContext } from './layout.ts';
export { wardleyLabelOverlaps, wardleyLayoutViolations } from './invariants.ts';
export type * from './types.ts';
