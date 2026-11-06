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
 * `kanban.padding` (D378) and the bounds are what is drawn (D224).
 */
import { fromPx } from '@mermaid-js/core/layout';
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import type { KanbanLayoutContext } from './context.ts';
import { drawnRects, union } from './extent.ts';
import type { KanbanLayoutCard, KanbanLayoutInput } from './input.ts';
import {
  configLengths,
  FONT_WEIGHT,
  KANBAN_METRICS,
  METRIC_AXIS,
  type KanbanMetrics,
} from './metrics.ts';
import type {
  CardLayout,
  ColumnLayout,
  KanbanLayout,
  KanbanPriority,
  PlacedLabel,
  PriorityBar,
} from './types.ts';

const PRIORITIES: ReadonlySet<string> = new Set<KanbanPriority>([
  'Very High',
  'High',
  'Low',
  'Very Low',
]);

/** The metrics in the render's units, across (`x`) or down (`y`). */
type Lengths = { readonly [K in keyof KanbanMetrics]: number };

interface Env {
  readonly m: Lengths;
  /** `W`. */
  readonly width: number;
  readonly padding: number;
  measure(text: string | undefined, max: number): MeasuredLabel | undefined;
}

function envOf(ctx: KanbanLayoutContext): Env {
  const lengths = configLengths(ctx.config.kanban ?? {}, (w) => ctx.warn(w));
  const px = (v: number, axis: 'x' | 'y'): number => fromPx(ctx.units, v, axis);
  const m = {} as Record<keyof KanbanMetrics, number>;
  for (const key of Object.keys(KANBAN_METRICS) as (keyof KanbanMetrics)[])
    m[key] =
      METRIC_AXIS[key] === 'W' ? KANBAN_METRICS[key] : px(KANBAN_METRICS[key], METRIC_AXIS[key]);
  const font: FontKey = {
    family: ctx.theme.value('fontFamily'),
    size: ctx.theme.number('fontSize'),
    weight: FONT_WEIGHT,
  };
  return {
    m,
    width: px(lengths.sectionWidth, 'x'),
    padding: px(lengths.padding, 'x'),
    measure: (text, max) => {
      if (text === undefined) return undefined;
      const label = layoutLabel(text, font, max > 0 ? max : 1, ctx.measurer, {
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

const height = (label: MeasuredLabel | undefined): number => label?.height ?? 0;

/** One card, its top at `top`, centred on `cx`. */
function cardOf(
  env: Env,
  source: KanbanLayoutCard,
  column: number,
  index: number,
  cx: number,
  top: number
): CardLayout {
  const { m } = env;
  const wrap = env.width - m.wrapInset;
  const title = env.measure(source.title, wrap);
  const ticket = env.measure(source.ticket, wrap);
  const assignee = env.measure(source.assigned, wrap);
  // v12 `heightAdj`: an empty label measures 0 high, so a card without either adds nothing.
  const adj = Math.max(height(ticket), height(assignee)) / 2;
  const width = env.width - m.cardInset;
  const x = cx - width / 2;
  const h = height(title) + 2 * m.cardPadY + adj;
  const titleTop = top + m.cardPadY - adj / 2;
  const row = titleTop + height(title);
  const bar: PriorityBar | undefined =
    source.priority !== undefined && PRIORITIES.has(source.priority)
      ? {
          x: x + m.barInset,
          y1: top + m.barInset,
          y2: top + h - m.barInset,
          width: m.barWidth,
          priority: source.priority as KanbanPriority,
        }
      : undefined;
  return {
    ast: source.ast,
    column,
    index,
    x,
    y: top,
    width,
    height: h,
    ...(title ? { title: placed(title, x + m.labelInset, titleTop) } : {}),
    ...(ticket ? { ticket: placed(ticket, x + m.labelInset, row) } : {}),
    ...(assignee
      ? { assignee: placed(assignee, x + width - m.labelInset - assignee.width, row) }
      : {}),
    ...(bar ? { bar } : {}),
  };
}

export function layoutKanban(input: KanbanLayoutInput, ctx: KanbanLayoutContext): KanbanLayout {
  const env = envOf(ctx);
  const { m } = env;
  const W = env.width;
  const top = -m.columnTop * W;
  // Titles first: the tallest sets the row every column shares.
  const titles = input.columns.map((c) => env.measure(c.title, W));
  const titleRow = Math.max(m.titleRow, ...titles.map(height));
  const columns: ColumnLayout[] = [];
  const cards: CardLayout[] = [];
  input.columns.forEach((source, k) => {
    // v12: column k (from 1) is centred at `W·k + 5(k − 1)`.
    const cx = W * (k + 1) + m.columnGap * k;
    let y = top + titleRow;
    source.cards.forEach((c, i) => {
      const laid = cardOf(env, c, k, i, cx, y);
      cards.push(laid);
      y += laid.height + m.cardGap;
    });
    const stack = y - (top + titleRow);
    const title = titles[k];
    columns.push({
      ast: source.ast,
      slot: k + 1,
      x: cx - W / 2,
      y: top,
      width: W,
      height: Math.max(stack + m.stackEnd, m.stackMin) + titleRow - m.titleRow,
      ...(title ? { title: placed(title, cx - title.width / 2, top) } : {}),
    });
  });
  const stroke = m.stroke;
  const box = union(drawnRects({ columns, cards, stroke }));
  const pad = env.padding;
  return {
    units: ctx.units.id,
    sectionWidth: W,
    titleRow,
    radius: m.radius,
    stroke,
    columns,
    cards,
    bounds: {
      x: box.x - pad,
      y: box.y - pad,
      width: box.width + 2 * pad,
      height: box.height + 2 * pad,
    },
  };
}
