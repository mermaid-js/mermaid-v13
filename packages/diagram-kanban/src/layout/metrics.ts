/**
 * The kanban layout's metrics table (pitfall 13): every length the layout uses, in px. This is
 * the only file in `layout/` that holds a length literal; the layout converts each one through
 * the render's unit profile.
 *
 * The values are v12's (`kanbanRenderer.ts:42-89`, `shapes/kanbanItem.ts:32-152`,
 * `clusters.js:308-418`) and the `kanban` config defaults of the v12 schema.
 */
import type { Warning } from '@mermaid-js/core';

export interface KanbanMetrics {
  /** `W` when `kanban.sectionWidth` is unset or 0 (`sectionWidth || 200`). */
  readonly sectionWidth: number;
  /** `kanban.padding`'s default: the outer margin (D378). */
  readonly padding: number;
  /** Between two columns (v12 `padding / 2`). */
  readonly columnGap: number;
  /** v12 places every column's top at `−columnTop × W`. */
  readonly columnTop: number;
  /** The least title-row height (v12 `maxLabelHeight` starts at 25). */
  readonly titleRow: number;
  /** A card is `W − cardInset` wide (v12 `1.5 × padding`). */
  readonly cardInset: number;
  /** Between two cards (v12 `padding / 2`). */
  readonly cardGap: number;
  /** Card labels wrap at `W − wrapInset` (v12 `width − 15 − 10`). */
  readonly wrapInset: number;
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
  /** The priority bar's inset from the card's left, top and bottom edges (v12 `floor(rx / 2)`, 2). */
  readonly barInset: number;
  readonly barWidth: number;
  /** Outline width of columns and cards (v12's CSS default). */
  readonly stroke: number;
}

export const KANBAN_METRICS: KanbanMetrics = {
  sectionWidth: 200,
  padding: 8,
  columnGap: 5,
  columnTop: 1.5,
  titleRow: 25,
  cardInset: 15,
  cardGap: 5,
  wrapInset: 25,
  labelInset: 10,
  cardPadY: 10,
  stackEnd: 30,
  stackMin: 50,
  radius: 5,
  barInset: 2,
  barWidth: 4,
  stroke: 1,
};

/**
 * The axis each length is converted along (`fromPx`), or `W` for a multiple of `W` that is not
 * converted.
 */
export const METRIC_AXIS: { readonly [K in keyof KanbanMetrics]: 'x' | 'y' | 'W' } = {
  sectionWidth: 'x',
  padding: 'x',
  columnGap: 'x',
  columnTop: 'W',
  titleRow: 'y',
  cardInset: 'x',
  cardGap: 'y',
  wrapInset: 'x',
  labelInset: 'x',
  cardPadY: 'y',
  stackEnd: 'y',
  stackMin: 'y',
  radius: 'x',
  barInset: 'y',
  barWidth: 'x',
  stroke: 'x',
};

/** Labels are drawn in the theme font at normal weight (v12's HTML labels). */
export const FONT_WEIGHT = 400;

/**
 * The largest length `kanban` config may set, in px. Far past any real board, and low enough
 * that the sums of the layout stay finite.
 */
export const MAX_LENGTH = 10000;

/** A config value the layout can't honour (pitfall 22): it lays out with the default instead. */
export const KANBAN_CONFIG_IGNORED = 'KANBAN_CONFIG_IGNORED';

/** A whole decimal number, spaces around it allowed: `"300"`, `" 300 "`; not `"300px"`. */
const NUMERIC = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?\s*$/i;

/** The px lengths `kanban` config sets for one render, over their defaults. */
export interface ConfigLengths {
  readonly sectionWidth: number;
  readonly padding: number;
}

/**
 * `kanban.sectionWidth` and `kanban.padding`, px. A number, or a whole numeric string as v12
 * takes it, from 0 to `MAX_LENGTH`; a `sectionWidth` of 0 is the default with no warning, as
 * v12's `sectionWidth || 200`. Anything else is the default with one `KANBAN_CONFIG_IGNORED`.
 */
export function configLengths(
  config: Readonly<Record<string, unknown>> = {},
  warn?: (w: Warning) => void
): ConfigLengths {
  const read = (key: keyof ConfigLengths): number => {
    const value = config[key];
    const fallback = KANBAN_METRICS[key];
    const n = typeof value === 'string' && NUMERIC.test(value) ? Number(value) : value;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_LENGTH)
      return key === 'sectionWidth' && n === 0 ? fallback : n;
    if (value !== undefined)
      warn?.({
        code: KANBAN_CONFIG_IGNORED,
        message: `Ignored kanban.${key}: it is not a number from 0 to ${MAX_LENGTH}; using ${fallback}`,
        path: `kanban.${key}`,
      });
    return fallback;
  };
  return { sectionWidth: read('sectionWidth'), padding: read('padding') };
}
