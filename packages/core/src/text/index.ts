/**
 * Label layout and text measurers (DESIGN §5).
 */
export { Style, SMALLER } from './measurer.ts';
export type { FontKey, Measurer, StyleBits, VerticalMetrics } from './measurer.ts';
export { DEFAULT_FONT_FAMILY, familyNames, resolveFontFamily } from './fonts.ts';
export { tableMeasurer } from './table.ts';
export { layoutLabel } from './label.ts';
export type { LabelOptions, MeasuredLabel, Run } from './label.ts';
export type { LabelBox, LabelSpan } from '../svg/writer.ts';
