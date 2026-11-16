/**
 * The lengths the c4-beta layout adds to the C4 metrics table (spec #730 §Layout, pitfall 13).
 * Everything else it measures with: `../layout/metrics.ts` (shapes, text sections, headers) and
 * the `c4` config (shape padding and margin, least width, wrapping).
 */
import { V12_SPACING } from '@mermaid-js/core/layout';

export const C4_BETA_METRICS = {
  /** The prototype's spacing: between elements in one rank, and between ranks. */
  nodeSpacing: 80,
  rankSpacing: 60,
  /** Between relations that run side by side: v12's. */
  edgeSpacing: V12_SPACING.edgeSpacing,
  /** Room kept past an arrowhead's length (`C4_METRICS.arrow`) before a label may start. */
  arrowGap: 2,
  /** Room between a boundary's header and what it holds. */
  headGap: 16,
  /** Room kept between a boundary's header and a relation that passes along it. */
  headClear: 4,
  /** The legend (v12's): the gap below the drawing, a swatch's side, and its gap to the text. */
  legendGap: 24,
  legendSwatch: 12,
  legendSwatchGap: 6,
  /** The space between legend rows (v12's row height of 18 less a 12 px swatch). */
  legendRowGap: 6,
  /** Text output, in cells: the rows above the drawing that hold the title, and a label block's blank cells beside its text. */
  cellTitleRows: 3,
  cellLabelPad: 2,
} as const;
