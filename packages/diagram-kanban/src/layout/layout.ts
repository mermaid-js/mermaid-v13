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
 * is drawn (D224).
 */
import { fromPx } from '@mermaid-js/core/layout';
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import { isBarPriority } from '../priority.ts';
import type { KanbanLayoutContext } from './context.ts';
import { drawnRects, inflate, union } from './extent.ts';
import type { KanbanLayoutCard, KanbanLayoutInput } from './input.ts';
import {
  COLUMN_TOP,
  configLengths,
  FONT_WEIGHT,
  KANBAN_METRICS,
  METRIC_AXIS,
  type KanbanMetrics,
} from './metrics.ts';
import type { CardLayout, ColumnLayout, KanbanLayout, PlacedLabel, PriorityBar } from './types.ts';

/** The metrics table in the render's units. */
type Lengths = { readonly [K in keyof KanbanMetrics]: number };

interface Env {
  readonly lengths: Lengths;
  /** `W`, in the render's units. */
  readonly sectionWidth: number;
  readonly padding: number;
  readonly font: FontKey;
  /** Lays out `text` wrapped at `wrap`; undefined when there is no text. */
  measure(text: string | undefined, wrap: number): MeasuredLabel | undefined;
}

function envOf(ctx: KanbanLayoutContext): Env {
  const config = configLengths(ctx.config.kanban ?? {}, (w) => ctx.warn(w));
  const convert = (px: number, axis: 'x' | 'y'): number => fromPx(ctx.units, px, axis);
  const lengths = {} as Record<keyof KanbanMetrics, number>;
  for (const key of Object.keys(KANBAN_METRICS) as (keyof KanbanMetrics)[])
    lengths[key] = convert(KANBAN_METRICS[key], METRIC_AXIS[key]);
  // Rounding to whole cells must not undo `MIN_SECTION_WIDTH`.
  lengths.minWrap = fromPx(ctx.units, KANBAN_METRICS.minWrap, 'x', KANBAN_METRICS.minWrap);
  const font: FontKey = {
    family: ctx.theme.value('fontFamily'),
    size: ctx.theme.number('fontSize'),
    weight: FONT_WEIGHT,
  };
  return {
    lengths,
    sectionWidth: Math.max(convert(config.sectionWidth, 'x'), lengths.wrapInset + lengths.minWrap),
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
  const { lengths } = env;
  const wrap = env.sectionWidth - lengths.wrapInset;
  const title = env.measure(source.title, wrap);
  const ticket = env.measure(source.ticket, wrap);
  const assignee = env.measure(source.assigned, wrap);
  // v12 `heightAdj`: an empty label measures 0 high, so a card without either adds nothing.
  const metaHalf = Math.max(heightOf(ticket), heightOf(assignee)) / 2;
  const width = env.sectionWidth - lengths.cardInset;
  const left = centre - width / 2;
  const height = heightOf(title) + 2 * lengths.cardPadY + metaHalf;
  const titleTop = top + lengths.cardPadY - metaHalf / 2;
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
          assignee: placed(assignee, left + width - lengths.labelInset - assignee.width, metaTop),
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
  const titles = input.columns.map((c) => env.measure(c.title, W));
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
