// Draws a laid-out kanban board through the SvgWriter (spec #424 T4, DESIGN §7). The layout
// (`layoutKanban`) measured and placed everything; this file only paints it, in v12's order:
// the columns (`g.sections`), then the cards (`g.items`). Each column and card is one group with
// `data-id` and `data-ast` (its item's AST id, R-PARSE-8); labels carry neither. Coordinates are
// absolute (v12's: columns from `−1.5 W`), and the viewBox is the layout's bounds (D224, D378).
// Columns and cards go through `w.outline` (hand-drawn, D379); the priority bar does not.
import {
  checkStyle,
  px,
  styleScope,
  styleText,
  themeStyleSheet,
  type Attrs,
  type SafeValue,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import type { FontKey } from '@mermaid-js/core/text';
import type { CardLayout, ColumnLayout, KanbanLayout, PlacedLabel } from '../layout/index.ts';
import type { KanbanItem, KanbanModel } from '../model.ts';
import type { KanbanRenderContext } from './context.ts';
import { priorityWarning, ticketUrl } from './links.ts';
import { paints, PRIORITY_COLORS, type Paints } from './paint.ts';

interface Scene {
  readonly w: SvgWriter;
  readonly layout: KanbanLayout;
  readonly ctx: KanbanRenderContext;
  readonly paint: Paints;
  /** The model item of each AST id drawn. */
  readonly items: ReadonlyMap<string, KanbanItem>;
}

/** An author's `:::` classes as class names: characters outside `[\w-]` dropped. */
function userClasses(names: readonly string[]): string {
  let out = '';
  for (const n of names) {
    const c = n.replace(/[^\w-]/g, '');
    if (c) out += ' ' + c;
  }
  return out;
}

/** Writes the whole `<svg>` document for a laid-out kanban board. */
export function renderKanban(
  model: KanbanModel,
  layout: KanbanLayout,
  ctx: KanbanRenderContext,
  w: SvgWriter
): void {
  const items = new Map<string, KanbanItem>();
  for (const item of model.items) items.set(item.ast, item);
  // Every theme variable is read before the root, so its style declares them.
  const scene: Scene = { w, layout, ctx, paint: paints(ctx.theme, layout), items };
  openRoot(scene);
  drawColumns(scene);
  drawCards(scene);
  w.close();
  const cards = layout.cards.flatMap((c) => items.get(c.ast) ?? []);
  const warning = priorityWarning(cards);
  if (warning) ctx.warn(warning);
}

/**
 * The `<svg>` root, in the layout's font (pitfall 16). Kanban has no title or description (its
 * grammar has none, and v12 draws no front-matter title, D218), so it writes no element id.
 */
function openRoot({ w, layout, ctx }: Scene): void {
  const { theme, config } = ctx;
  const { x, y } = layout.bounds;
  const width = Math.max(1, Math.ceil(layout.bounds.width));
  const height = Math.max(1, Math.ceil(layout.bounds.height));
  const maxWidth = config.kanban?.useMaxWidth !== false;
  // Read before the root style and the auto sheet are written, so they declare its aliases.
  const font = fontAttrs(layout.font, theme);
  const auto = theme.autoDeclarations();
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-kanban',
    viewBox: [x, y, width, height],
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : height,
    role: 'img',
    'aria-roledescription': 'kanban',
    'data-mermaid-version': ctx.version,
    'data-p': auto ? styleScope(ctx.idPrefix) : undefined,
    style: styleText(maxWidth ? { 'max-width': px(width) } : {}, theme.rootStyleText()),
    ...font,
  });
  if (auto) w.styleSheet(themeStyleSheet(styleScope(ctx.idPrefix), auto.light, auto.dark));
}

/**
 * The root's font: the theme's variables when the layout measured in the theme font (always,
 * through the pipeline), else the layout's font as literals.
 */
function fontAttrs(f: FontKey, theme: KanbanRenderContext['theme']): Attrs {
  const family =
    f.family === theme.value('fontFamily')
      ? theme.font()
      : (checkStyle(['font-family:' + f.family]).text['font-family'] as SafeValue | undefined);
  const size = f.size === theme.number('fontSize') ? theme.length('fontSize') : f.size;
  return { 'font-family': family, 'font-size': size };
}

const centreX = (r: PlacedLabel): number => r.x + r.width / 2;
const centreY = (r: PlacedLabel): number => r.y + r.height / 2;

/** A label in its `g.label` group; card labels are left-aligned in their box. */
function drawLabel(
  w: SvgWriter,
  label: PlacedLabel,
  cls: string,
  fill: Attrs['fill'],
  left: boolean
): void {
  w.open('g', { class: cls, fill });
  w.label(left ? { ...label.text, left: true } : label.text, centreX(label), centreY(label));
  w.close();
}

function drawColumns(scene: Scene): void {
  const { w, layout } = scene;
  if (layout.columns.length === 0) return;
  w.open('g', { class: 'sections' });
  for (const c of layout.columns) drawColumn(scene, c);
  w.close();
}

/** v12 `kanbanSection`: `g.cluster.section-<k>` with the column rect and its centred title. */
function drawColumn({ w, layout, paint, items }: Scene, c: ColumnLayout): void {
  const item = items.get(c.ast);
  w.open('g', {
    class: `cluster section-${c.slot}${userClasses(item?.classes ?? [])}`,
    'data-id': c.ast,
    'data-ast': c.ast,
  });
  const fill = paint.column(c.slot);
  w.outline('group', 'rect', {
    x: c.x,
    y: c.y,
    width: c.width,
    height: c.height,
    rx: layout.radius,
    ry: layout.radius,
    fill,
    stroke: fill,
    'stroke-width': layout.stroke,
  });
  if (c.title) drawLabel(w, c.title, 'cluster-label', paint.text, false);
  w.close();
}

function drawCards(scene: Scene): void {
  const { w, layout } = scene;
  if (layout.cards.length === 0) return;
  w.open('g', { class: 'items' });
  for (const card of layout.cards) drawCard(scene, card);
  w.close();
}

/**
 * v12 `kanbanItem`: `g.node` with the card rect, the priority bar, the title, the ticket (a link
 * when `kanban.ticketBaseUrl` gives one that passes `checkUrl`, D377) and the assignee.
 */
function drawCard(scene: Scene, card: CardLayout): void {
  const { w, layout, paint, ctx, items } = scene;
  const item = items.get(card.ast);
  w.open('g', {
    class: `node${userClasses(item?.classes ?? [])}`,
    'data-id': card.ast,
    'data-ast': card.ast,
  });
  w.outline('node', 'rect', {
    class: 'basic label-container',
    x: card.x,
    y: card.y,
    width: card.width,
    height: card.height,
    rx: layout.radius,
    ry: layout.radius,
    fill: paint.cardFill,
    stroke: paint.cardStroke,
    'stroke-width': layout.stroke,
  });
  if (card.bar)
    w.leaf('line', {
      class: 'kanban-priority',
      x1: card.bar.x,
      y1: card.bar.y1,
      x2: card.bar.x,
      y2: card.bar.y2,
      stroke: PRIORITY_COLORS[card.bar.priority],
      'stroke-width': card.bar.width,
    });
  if (card.title) drawLabel(w, card.title, 'label', paint.text, true);
  if (card.ticket) {
    const href = ticketUrl(item?.ticket, ctx);
    if (href) {
      w.open('a', {
        class: 'kanban-ticket-link',
        href,
        target: '_blank',
        'text-decoration': 'underline',
      });
      drawLabel(w, card.ticket, 'label', paint.text, true);
      w.close();
    } else drawLabel(w, card.ticket, 'label', paint.text, true);
  }
  if (card.assignee) drawLabel(w, card.assignee, 'label', paint.text, true);
  w.close();
}
