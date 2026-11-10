/**
 * The kanban layout's metrics table (pitfall 13): every length the layout uses, in px. This is
 * the only file in `layout/` that holds a numeric literal past 0 and 2; the layout converts each
 * length through the render's unit profile, along the axis `METRIC_AXIS` gives.
 *
 * The values are v12's (`kanbanRenderer.ts:42-89`, `shapes/kanbanItem.ts:32-152`,
 * `clusters.js:308-418`); `sectionWidth` and `padding` are the generated `kanban` config defaults
 * of the schema (v12's).
 */
import type { Warning } from '@mermaid-js/core';
import type { KanbanDiagramConfig } from '@mermaid-js/core/config';
import { KANBAN_CONFIG_IGNORED } from '../codes.ts';
import { kanbanConfigDefaults } from '../generated/config-defaults.ts';
import { NUMERIC } from '@mermaid-js/core/config';

/**
 * The generated `kanban` section defaults, with every key set: the schema gives each of
 * `sectionWidth` and `padding` a `default`, so the generated object has both.
 */
const SCHEMA_DEFAULTS = kanbanConfigDefaults as Required<
  Pick<KanbanDiagramConfig, 'sectionWidth' | 'padding'>
>;

export interface KanbanMetrics {
  /** `W` when `kanban.sectionWidth` is unset or 0 (`sectionWidth || 200`). */
  readonly sectionWidth: number;
  /** `kanban.padding`'s default: the outer margin (D378). */
  readonly padding: number;
  /** Column titles wrap at `W − titleInset` (v12: at `W`). */
  readonly titleInset: number;
  /** Between two columns (v12 `padding / 2`). */
  readonly columnGap: number;
  /** The least title-row height (v12 `maxLabelHeight` starts at 25). */
  readonly titleRow: number;
  /** A card is `W − cardInset` wide (v12 `1.5 × padding`). */
  readonly cardInset: number;
  /** Between two cards (v12 `padding / 2`). */
  readonly cardGap: number;
  /** Card labels wrap at `W − wrapInset` (v12 `width − 15 − 10`). */
  readonly wrapInset: number;
  /** The least width a label wraps at. */
  readonly minWrap: number;
  /** Card labels sit this far in from the card's left and right edges. */
  readonly labelInset: number;
  /** Above and below a card's title (v12 `labelPaddingY`). */
  readonly cardPadY: number;
  /** v12 adds this to the column's card stack (`3 × padding`). */
  readonly stackEnd: number;
  /** The least column body, before the title row grows it (v12 `max(…, 50)`). */
  readonly stackMin: number;
  /** Corner radius of columns and cards. */
  readonly radius: number;
  /** The priority bar's line from the card's left edge (v12 `x + 2`). */
  readonly barInsetX: number;
  /** The priority bar's ends from the card's top and bottom (v12 `floor(rx / 2)`, 2). */
  readonly barInsetY: number;
  readonly barWidth: number;
  /** Outline width of columns and cards (v12's CSS default). */
  readonly stroke: number;
}

export const KANBAN_METRICS: KanbanMetrics = {
  // The `kanban` config defaults (`pnpm gen:config`, the plugin's `configDefaults`).
  sectionWidth: SCHEMA_DEFAULTS.sectionWidth,
  padding: SCHEMA_DEFAULTS.padding,
  titleInset: 0,
  columnGap: 5,
  titleRow: 25,
  cardInset: 15,
  cardGap: 5,
  wrapInset: 25,
  minWrap: 1,
  labelInset: 10,
  cardPadY: 10,
  stackEnd: 30,
  stackMin: 50,
  radius: 5,
  barInsetX: 2,
  barInsetY: 2,
  barWidth: 4,
  stroke: 1,
};

/** The axis each length is converted along (`fromPx`). */
export const METRIC_AXIS: { readonly [K in keyof KanbanMetrics]: 'x' | 'y' } = {
  sectionWidth: 'x',
  padding: 'x',
  titleInset: 'x',
  columnGap: 'x',
  titleRow: 'y',
  cardInset: 'x',
  cardGap: 'y',
  wrapInset: 'x',
  minWrap: 'x',
  labelInset: 'x',
  cardPadY: 'y',
  stackEnd: 'y',
  stackMin: 'y',
  radius: 'x',
  barInsetX: 'x',
  barInsetY: 'y',
  barWidth: 'x',
  stroke: 'x',
};

/** The lengths the layout takes from a table; `sectionWidth` and `padding` come from config. */
export type KanbanLengths = Omit<KanbanMetrics, 'sectionWidth' | 'padding'>;

/** The keys of `KanbanLengths`, the ones a px table converts. */
export const LENGTH_KEYS = (Object.keys(KANBAN_METRICS) as (keyof KanbanMetrics)[]).filter(
  (k): k is keyof KanbanLengths => k !== 'sectionWidth' && k !== 'padding'
);

/**
 * The lengths in cells, for the text output (#466): v12's px values scaled to cells would put
 * labels on the borders, so cells have their own (as sequence's cell column, D108). A border
 * takes a cell: a column is `┌─ title ─┐` (the title on its top border, a rule and a space
 * either side), its cards one cell in from its sides and stacked with no row between, each
 * card's text one space in from its border, and nothing between the last card and the column's
 * bottom border. `sectionWidth` and `padding` are the config's px values, converted.
 */
export const KANBAN_CELL_METRICS: KanbanLengths = {
  titleInset: 6,
  columnGap: 1,
  titleRow: 1,
  cardInset: 4,
  cardGap: 0,
  wrapInset: 8,
  minWrap: 1,
  labelInset: 2,
  cardPadY: 1,
  stackEnd: 2,
  stackMin: 3,
  radius: 0,
  barInsetX: 0,
  barInsetY: 0,
  barWidth: 1,
  stroke: 0,
};

/** How a card's ticket row adds to its height: shares of the row, not lengths. */
export interface MetaRow {
  /** The share of the row's height the card grows by (v12 `heightAdj`: a half). */
  readonly grow: number;
  /** The share of the row's height the title moves up by (v12: a quarter). */
  readonly lift: number;
  /** A ticket and assignee that do not fit side by side go on rows of their own (v12 overlaps them). */
  readonly stack: boolean;
}

export const PX_META_ROW: MetaRow = { grow: 0.5, lift: 0.25, stack: false };

/** In cells the row is a row of its own, under the title and inside the card's border. */
export const CELL_META_ROW: MetaRow = { grow: 1, lift: 0, stack: true };

/** What one unit profile lays out with: its lengths and its ticket row. */
export interface KanbanUnits {
  readonly lengths: KanbanLengths;
  readonly meta: MetaRow;
}

/** The text output's (`units.id === 'cell'`). */
export const CELL_UNITS: KanbanUnits = { lengths: KANBAN_CELL_METRICS, meta: CELL_META_ROW };

/** v12 places every column's top at `−COLUMN_TOP × W`: a multiple of `W`, not a length. */
export const COLUMN_TOP = 1.5;

/** Labels are drawn in the theme font at normal weight (v12's HTML labels). */
export const FONT_WEIGHT = 400;

/**
 * The largest length `kanban` config may set, in px. Far past any real board, and low enough
 * that the sums of the layout stay finite.
 */
export const MAX_LENGTH = 10000;

/**
 * The least `W`, px: the width at which card labels still wrap at `minWrap` (and so cards,
 * `W − cardInset` wide, are wider than 0).
 */
export const MIN_SECTION_WIDTH = KANBAN_METRICS.wrapInset + KANBAN_METRICS.minWrap;

/** The px lengths `kanban` config sets for one render, over their defaults. */
export interface ConfigLengths {
  readonly sectionWidth: number;
  readonly padding: number;
}

/**
 * `kanban.sectionWidth` and `kanban.padding`, px. A number, or a whole numeric string as v12
 * takes it, from 0 to `MAX_LENGTH`; a `sectionWidth` of 0 is the default with no warning, as
 * v12's `sectionWidth || 200`. A `sectionWidth` above 0 and below `MIN_SECTION_WIDTH` is raised
 * to it, and anything else is the default, each with one `KANBAN_CONFIG_IGNORED`.
 */
export function configLengths(
  config: Readonly<Record<string, unknown>> = {},
  warn?: (w: Warning) => void
): ConfigLengths {
  const ignored = (key: keyof ConfigLengths, why: string, using: number): void =>
    warn?.({
      code: KANBAN_CONFIG_IGNORED,
      message: `Ignored kanban.${key}: ${why}; using ${using}`,
      path: `kanban.${key}`,
    });
  const read = (key: keyof ConfigLengths): number => {
    const value = config[key];
    const fallback = KANBAN_METRICS[key];
    const n = typeof value === 'string' && NUMERIC.test(value) ? Number(value) : value;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_LENGTH) {
      if (key !== 'sectionWidth') return n;
      if (n === 0) return fallback;
      if (n >= MIN_SECTION_WIDTH) return n;
      ignored(
        key,
        `a column narrower than ${MIN_SECTION_WIDTH} px leaves its cards no width`,
        MIN_SECTION_WIDTH
      );
      return MIN_SECTION_WIDTH;
    }
    if (value !== undefined) ignored(key, `it is not a number from 0 to ${MAX_LENGTH}`, fallback);
    return fallback;
  };
  return { sectionWidth: read('sectionWidth'), padding: read('padding') };
}
