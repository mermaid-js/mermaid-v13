/**
 * The venn custom layout (spec #429 T3): `layoutVenn` and its result type, the styles merged by
 * target, and the invariants.
 */
export { layoutVenn, type VennLayoutContext } from './layout.ts';
export { vennLayoutViolations } from './invariants.ts';
export { areaKey, vennStyles } from './styles.ts';
export { VENN_METRICS, VENN_SLOTS } from './metrics.ts';
export type * from './types.ts';
