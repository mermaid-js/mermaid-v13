/**
 * Label layout and text measurers (DESIGN §5).
 */
export { Style, SMALLER } from './measurer.ts';
export type { FontKey, Measurer, StyleBits, VerticalMetrics } from './measurer.ts';
export { DEFAULT_FONT_FAMILY, familyNames, fontSizePx, resolveFontFamily } from './fonts.ts';
export { tableMeasurer } from './table.ts';
export { layoutLabel } from './label.ts';
export type { BoxRun, LabelOptions, MeasuredLabel, Run } from './label.ts';
export { inlineSpans } from './inline.ts';
export type { InlineProvider, InlineRequest, InlineSpans } from './inline.ts';
export type { InlineBox, LabelBox, LabelBoxSpan, LabelSpan, SvgFragment } from '../svg/writer.ts';
