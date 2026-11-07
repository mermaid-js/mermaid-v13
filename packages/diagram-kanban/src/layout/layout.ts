/**
 * The kanban custom layout (spec #424 T3): v12's placement (`kanbanRenderer.ts:42-89`,
 * `shapes/kanbanItem.ts:32-152`, `clusters.js:308-418`) without its drawing or module state
 * (R-ARCH-4). Every label is measured first, through core's label layout with markdown on
 * (D372); every length comes from the metrics table, through the render's unit profile
 * (pitfall 13).
 *
 * Kept from v12: columns `W` wide and `W + 5` apart, each its own height; one title row,
 * `max(25, tallest title)`, shared by all; cards `W − 15` wide, centred, 5 apart; a card's height
 * `title + 20 + a`, with `a` half the taller of ticket and assignee (0 without either: checked
 * on a v12 render); the priority bar 2 in from the left, top and bottom. Changed: the margin is
 * `kanban.padding` (D378), `W` has a least value (`MIN_SECTION_WIDTH`), and the bounds are what
 * is drawn (D224). In cells (the text output, #466) the lengths are `KANBAN_CELL_METRICS`, the
 * ticket row is a row of its own (`CELL_META_ROW`), and a ticket and assignee that do not fit
 * side by side are stacked; the px layout is unchanged.
 */
import type { Warning } from '@mermaid-js/core';
import { fromPx, type UnitProfile } from '@mermaid-js/core/layout';
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import { isBarPriority } from '../priority.ts';
import type { KanbanLayoutContext } from './context.ts';
import { drawnRects, inflate, union } from './extent.ts';
import type { KanbanLayoutCard, KanbanLayoutInput } from './input.ts';
import {
  CELL_UNITS,
  COLUMN_TOP,
  configLengths,
  FONT_WEIGHT,
  KANBAN_CONFIG_IGNORED,
  KANBAN_METRICS,
  LENGTH_KEYS,
  METRIC_AXIS,
  PX_META_ROW,
  type KanbanLengths,
  type KanbanUnits,
  type MetaRow,
} from './metrics.ts';
import type { CardLayout, ColumnLayout, KanbanLayout, PlacedLabel, PriorityBar } from './types.ts';

/** The metrics table in the render's units. */
type Lengths = { readonly [K in keyof KanbanLengths]: number };

/** The lengths and ticket row of a profile: cells have their own (#466); px converts the table. */
function unitsOf(units: UnitProfile): KanbanUnits {
  if (units.id === 'cell') return CELL_UNITS;
  const lengths = {} as Record<keyof KanbanLengths, number>;
  for (const key of LENGTH_KEYS)
    lengths[key] = fromPx(units, KANBAN_METRICS[key], METRIC_AXIS[key]);
  lengths.minWrap = fromPx(units, KANBAN_METRICS.minWrap, 'x', KANBAN_METRICS.minWrap);
  return { lengths, meta: PX_META_ROW };
}

interface Env {
  readonly lengths: Lengths;
  readonly meta: MetaRow;
  /** `W`, in the render's units. */
  readonly sectionWidth: number;
  readonly padding: number;
  readonly font: FontKey;
  /** Lays out `text` wrapped at `wrap`; undefined when there is no text. */
  measure(text: string | undefined, wrap: number): MeasuredLabel | undefined;
}

/**
 * `W` in the render's units: the config's, at least what leaves card labels `minWrap` to wrap
 * at. In px that least is `MIN_SECTION_WIDTH`, which `configLengths` already raised to; in
 * cells it is wider than 26 px converts to, so a raise there is its own `KANBAN_CONFIG_IGNORED`
 * in place of `configLengths`' one (pitfall 22: one warning per render, naming what is drawn).
 */
function sectionWidthOf(
  ctx: KanbanLayoutContext,
  lengths: Lengths,
  asked: number,
  warnings: Warning[]
): number {
  const width = fromPx(ctx.units, asked, 'x');
  const least = lengths.wrapInset + lengths.minWrap;
  if (width >= least) return width;
  const path = 'kanban.sectionWidth';
  const at = warnings.findIndex((w) => w.path === path);
  const px = least * ctx.units.pxPerUnit.x;
  const warning: Warning = {
    code: KANBAN_CONFIG_IGNORED,
    message: `Ignored kanban.sectionWidth: a column narrower than ${least} ${ctx.units.id === 'cell' ? 'cells' : 'px'} (${px} px) leaves its cards no width; using ${least}`,
    path,
  };
  // `sectionWidth` is read first, so a warning of its own goes first.
  if (at < 0) warnings.unshift(warning);
  else warnings[at] = warning;
  return least;
}

function envOf(ctx: KanbanLayoutContext): Env {
  const warnings: Warning[] = [];
  const config = configLengths(ctx.config.kanban ?? {}, (w) => warnings.push(w));
  const convert = (px: number, axis: 'x' | 'y'): number => fromPx(ctx.units, px, axis);
  const { lengths, meta } = unitsOf(ctx.units);
  const sectionWidth = sectionWidthOf(ctx, lengths, config.sectionWidth, warnings);
  for (const w of warnings) ctx.warn(w);
  const font: FontKey = {
    family: ctx.theme.value('fontFamily'),
    size: ctx.theme.number('fontSize'),
    weight: FONT_WEIGHT,
  };
  return {
    lengths,
    meta,
    sectionWidth,
    padding: convert(config.padding, 'x'),
    font,
    measure: (text, wrap) => {
      if (text === undefined) return undefined;
      const label = layoutLabel(text, font, wrap, ctx.measurer, {
        markdown: true,
        ...(ctx.inline ? { inline: ctx.inline } : {}),
      });
      return label.lines.length === 0 ? undefined : label;
    },
  };
}

const placed = (text: MeasuredLabel, x: number, y: number): PlacedLabel => ({
  x,
  y,
  width: text.width,
  height: text.height,
  text,
});

const heightOf = (label: MeasuredLabel | undefined): number => label?.height ?? 0;

/** One card, its top at `top`, centred on `centre`. */
function cardOf(
  env: Env,
  source: KanbanLayoutCard,
  column: number,
  index: number,
  centre: number,
  top: number
): CardLayout {
  const { lengths, meta } = env;
  const wrap = env.sectionWidth - lengths.wrapInset;
  const title = env.measure(source.title, wrap);
  const ticket = env.measure(source.ticket, wrap);
  const assignee = env.measure(source.assigned, wrap);
  const width = env.sectionWidth - lengths.cardInset;
  const left = centre - width / 2;
  const stacked =
    meta.stack &&
    ticket !== undefined &&
    assignee !== undefined &&
    ticket.width + assignee.width >= width - 2 * lengths.labelInset;
  // The ticket row's height: an empty label measures 0 high, so a card without either adds
  // nothing (v12 `heightAdj`, of which the card grows by `meta.grow`).
  const metaRow = stacked
    ? heightOf(ticket) + heightOf(assignee)
    : Math.max(heightOf(ticket), heightOf(assignee));
  const height = heightOf(title) + 2 * lengths.cardPadY + metaRow * meta.grow;
  const titleTop = top + lengths.cardPadY - metaRow * meta.lift;
  const metaTop = titleTop + heightOf(title);
  const bar: PriorityBar | undefined =
    source.priority !== undefined && isBarPriority(source.priority)
      ? {
          x: left + lengths.barInsetX,
          y1: top + lengths.barInsetY,
          y2: top + height - lengths.barInsetY,
          width: lengths.barWidth,
          priority: source.priority,
        }
      : undefined;
  return {
    ast: source.ast,
    column,
    index,
    x: left,
    y: top,
    width,
    height,
    ...(title ? { title: placed(title, left + lengths.labelInset, titleTop) } : {}),
    ...(ticket ? { ticket: placed(ticket, left + lengths.labelInset, metaTop) } : {}),
    ...(assignee
      ? {
          assignee: placed(
            assignee,
            left + width - lengths.labelInset - assignee.width,
            stacked ? metaTop + heightOf(ticket) : metaTop
          ),
        }
      : {}),
    ...(bar ? { bar } : {}),
  };
}

export function layoutKanban(input: KanbanLayoutInput, ctx: KanbanLayoutContext): KanbanLayout {
  const env = envOf(ctx);
  const { lengths, sectionWidth: W } = env;
  const top = -COLUMN_TOP * W;
  // Titles first: the tallest sets the row every column shares.
  const titles = input.columns.map((c) => env.measure(c.title, W - lengths.titleInset));
  const titleRow = Math.max(lengths.titleRow, ...titles.map(heightOf));
  const columns: ColumnLayout[] = [];
  const cards: CardLayout[] = [];
  let ordinal = 0;
  input.columns.forEach((source, k) => {
    ordinal++;
    // v12 centres column k (from 1) at `W·k + 5(k − 1)`: the first one's left edge is at W / 2.
    const left = W / 2 + k * (W + lengths.columnGap);
    const centre = left + W / 2;
    const stackTop = top + titleRow;
    let y = stackTop;
    source.cards.forEach((card, i) => {
      const laid = cardOf(env, card, k, i, centre, y);
      cards.push(laid);
      y += laid.height + lengths.cardGap;
    });
    const title = titles[k];
    columns.push({
      ast: source.ast,
      ordinal,
      x: left,
      y: top,
      width: W,
      height:
        Math.max(y - stackTop + lengths.stackEnd, lengths.stackMin) + titleRow - lengths.titleRow,
      ...(title ? { title: placed(title, centre - title.width / 2, top) } : {}),
    });
  });
  const stroke = lengths.stroke;
  return {
    units: ctx.units.id,
    font: env.font,
    sectionWidth: W,
    titleRow,
    radius: lengths.radius,
    stroke,
    columns,
    cards,
    bounds: inflate(union(drawnRects({ columns, cards, stroke })), env.padding),
  };
}
