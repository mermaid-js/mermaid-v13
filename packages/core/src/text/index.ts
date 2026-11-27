/**
 * Label layout and text measurers (DESIGN §5).
 */
export { Style, SMALLER } from './measurer.ts';
export type { FontKey, Measurer, StyleBits, VerticalMetrics } from './measurer.ts';
export { DEFAULT_FONT_FAMILY, familyNames, fontSizePx, resolveFontFamily } from './fonts.ts';
export { tableMeasurer } from './table.ts';
export type { FontTable, TableMeasurerOptions } from './font-tables.ts';
// `emphasisAt` and `markdownLines`: how a label's emphasis marks and markdown lines are read,
// for an extension that lays labels out itself (D695) and must read them as core does.
export { emphasisAt, layoutLabel, markdownLines, markdownString } from './label.ts';
export type { BoxRun, LabelMarkup, LabelOptions, MeasuredLabel, Run, SourceLine } from './label.ts';
export { decodeEntities, entityAt } from './entities.ts';
export { inlineSpans } from './inline.ts';
export type {
  InlinePairProvider,
  InlinePatternProvider,
  InlineProvider,
  InlineRequest,
  InlineSpans,
  LabelBoxer,
  LabelBoxes,
  LabelRequest,
} from './inline.ts';
export type { InlineBox, LabelBox, LabelBoxSpan, LabelSpan, SvgFragment } from '../svg/writer.ts';
