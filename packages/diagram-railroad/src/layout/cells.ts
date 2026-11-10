/**
 * The layout in cells, for the text output (#617, D518): the text entry hands `layoutRailroad`
 * these options, so v12's algorithm runs on the cell tables of `metrics.ts` and the text follows
 * the SVG geometry at cell scale (choices centred, the bypass above, the loop below), while the
 * SVG path carries none of this. A point is a cell's centre; `../ascii/draw.ts` draws each
 * primitive in the cells it passes through.
 */
import { cellProfile, type UnitProfile } from '@mermaid-js/core/layout';
import type { Measurer } from '@mermaid-js/core/text';
import type { RailroadModel } from '../model.ts';
import {
  layoutRailroad,
  type ChoiceGuard,
  type RailroadCellOptions,
  type RailroadLayoutContext,
} from './layout.ts';
import {
  BOLD_WEIGHT,
  CELL_MAIN_CLEARANCE,
  CELL_RULE_ROOM,
  CELL_TEXT_METRICS,
  CELL_TEXT_ROOM,
  RAILROAD_CELL_LENGTHS,
  RAILROAD_CELL_METRICS,
} from './metrics.ts';
import type { RailroadLayout } from './types.ts';

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

/**
 * The main line in cells (#617 review): on a whole row (on an on-line branch's track, else
 * half the height rounded down the page), and a full row clear of every off-line branch's whole
 * extent, its box and any bypass above or loop below. The branches above keep their place; the
 * main line and what is on or below it move down as far as that needs, then the branches below
 * move further down as far as they need.
 */
export const cellGuard: ChoiceGuard = (items, tops, side, centre) => {
  let main = side.includes(0) ? Math.round(centre) : Math.ceil(centre);
  let above = -Infinity;
  items.forEach((it, i) => {
    if (side[i]! < 0) above = Math.max(above, tops[i]! + it.up + it.down);
  });
  const raise = Math.max(0, above + CELL_MAIN_CLEARANCE - main);
  main += raise;
  let below = Infinity;
  items.forEach((it, i) => {
    if (side[i] === 0) tops[i] = main - it.up;
    else if (side[i]! > 0) below = Math.min(below, (tops[i] = tops[i]! + raise));
  });
  const lower = Math.max(0, main + CELL_MAIN_CLEARANCE - below);
  items.forEach((_, i) => {
    if (side[i]! > 0) tops[i] = tops[i]! + lower;
  });
  return main;
};

/** The cell options of a profile: its padding preset's lengths (D77), `measurer` in cells. */
export function cellOptions(units: UnitProfile, measurer: Measurer): RailroadCellOptions {
  return {
    lengths: RAILROAD_CELL_LENGTHS[units === cellProfile('roomy') ? 'roomy' : 'compact'],
    metrics: RAILROAD_CELL_METRICS,
    measurer: cellBoxMeasurer(measurer),
    guard: cellGuard,
    ruleRoom: CELL_RULE_ROOM,
  };
}

/** `model` laid out in cells under `ctx.units` (a cell profile) with `ctx.measurer` (cells). */
export function layoutInCells(
  model: RailroadModel,
  ctx: RailroadLayoutContext & { readonly units: UnitProfile }
): RailroadLayout {
  return layoutRailroad(model, ctx, cellOptions(ctx.units, ctx.measurer));
}
