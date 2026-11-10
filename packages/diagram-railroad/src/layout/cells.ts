/**
 * The layout in cells, for the text output (#617, D518): with the cell profile (`ctx.units.id`
 * `cell`), `layoutRailroad` runs v12's algorithm unchanged on the cell tables of `metrics.ts`, so
 * the text follows the SVG geometry at cell scale (choices centred, the bypass above, the loop
 * below). A point is a cell's centre; the text entry (`../ascii/draw.ts`) draws each primitive in
 * the cells it passes through.
 */
import type { RenderContext } from '@mermaid-js/core';
import type { Measurer } from '@mermaid-js/core/text';
import type { RailroadLayoutConfig } from '../config.ts';
import {
  BOLD_WEIGHT,
  CELL_TEXT_METRICS,
  CELL_TEXT_ROOM,
  RAILROAD_CELL_LENGTHS,
  RAILROAD_CELL_METRICS,
  RAILROAD_METRICS,
  type RailroadMetrics,
} from './metrics.ts';

/** Whether the render lays out in cells (the text output's profile). */
export const inCells = (ctx: Partial<Pick<RenderContext, 'units'>>): boolean =>
  ctx.units?.id === 'cell';

/**
 * A text as one row of cells: a line break, tab or other control character is a space, as the
 * SVG shows it (a `text` element draws no line break).
 */
export function cellText(text: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are what it replaces
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ');
}

/**
 * `measurer` (the cell measurer) as the cell layout reads it: a text one row high, and a box's
 * text `CELL_TEXT_ROOM` wider so it sits centred between its borders. Rule names (bold) are
 * measured as they are.
 */
export function cellBoxMeasurer(measurer: Measurer): Measurer {
  return {
    id: `${measurer.id}+railroad`,
    width: (text, font, style) =>
      measurer.width(cellText(text), font, style) +
      (font.weight >= BOLD_WEIGHT ? 0 : CELL_TEXT_ROOM),
    metrics: () => CELL_TEXT_METRICS,
  };
}

/** The lengths the cell layout uses: the `ascii.padding` preset's (D77). */
export function cellLengths(config: { readonly ascii?: unknown }): RailroadLayoutConfig {
  const padding = (config.ascii as { padding?: unknown } | undefined)?.padding;
  return RAILROAD_CELL_LENGTHS[padding === 'roomy' ? 'roomy' : 'compact'];
}

/** The fixed lengths of a layout in px or in cells. */
export const metricsFor = (cells: boolean): RailroadMetrics =>
  cells ? RAILROAD_CELL_METRICS : RAILROAD_METRICS;
