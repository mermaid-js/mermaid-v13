/**
 * The XY chart custom layout (spec #426 T3): `layoutXyChart`, its result type and the D383
 * warning codes. The invariants and the d3 re-implementations are in `../testing.ts`.
 */
export {
  layoutXyChart,
  XYCHART_EMPTY_RANGE,
  XYCHART_LABEL_TOO_SMALL,
  XYCHART_MISSING_VALUE,
  type XyChartLayoutContext,
} from './layout.ts';
export type * from './types.ts';
