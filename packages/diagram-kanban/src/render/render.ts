/**
 * Draws a laid-out kanban board through the SvgWriter (spec #424 T4, DESIGN §7). The layout
 * (`layoutKanban`) measured and placed everything; this file only paints it, in v12's order:
 * the columns (`g.sections`), then the cards (`g.items`). Each column and card is one group with
 * `data-id` and `data-ast` (its item's AST id, R-PARSE-8); labels carry neither. Coordinates are
 * absolute (v12's: columns from `−1.5 W`), and the viewBox is the layout's bounds (D224, D378).
 * Columns and cards go through `w.outline` (hand-drawn, D379); the priority bar does not.
 */
import { checkStyle, type Attrs, type SafeValue, type SvgWriter } from '@mermaid-js/core/svg';
import { centreX, centreY, openSvgRoot } from '@mermaid-js/shared/svg/document';
import type { FontKey, Run } from '@mermaid-js/core/text';
import type { CardLayout, ColumnLayout, KanbanLayout, PlacedLabel } from '../layout/index.ts';
import type { KanbanItem, KanbanModel } from '../model.ts';
import type { KanbanRenderContext } from './context.ts';
import { userClasses } from './classes.ts';
import { ticketUrl } from './links.ts';
import { paints, PRIORITY_COLORS, type CardPaint, type Paints } from './paint.ts';
import { priorityWarning } from './priority.ts';

interface Scene {
  readonly w: SvgWriter;
  readonly layout: KanbanLayout;
  readonly ctx: KanbanRenderContext;
  readonly paint: Paints;
  /** The model item of each AST id drawn. */
  readonly items: ReadonlyMap<string, KanbanItem>;
}

/** The model item an AST id the layout placed came from; every one has one. */
function itemOf(items: ReadonlyMap<string, KanbanItem>, ast: string): KanbanItem {
  const item = items.get(ast);
  if (!item) throw new Error(`kanban: no item for ${ast}`);
  return item;
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
  const cards = layout.cards.map((c) => itemOf(items, c.ast));
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
  openSvgRoot(w, ctx, {
    name: 'kanban',
    viewBox: [x, y, width, height],
    maxWidth,
    attrs: { ...font },
  });
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
  const item = itemOf(items, c.ast);
  w.open('g', {
    class: `cluster section-${c.ordinal}${userClasses(item.classes)}`,
    'data-id': c.ast,
    'data-ast': c.ast,
  });
  const fill = paint.column(c.ordinal);
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

/** A card's title or ticket: left-aligned in its box, in `textColor`. */
function drawCardLabel({ w, paint }: Scene, label: PlacedLabel): void {
  drawLabel(w, label, 'label', paint.text, true);
}

/** A run drawn as bare text: no style, no attributes, not an inline box. */
const plain = (r: Run): boolean =>
  r.kind !== 'box' && !r.bold && !r.italic && !r.underline && !r.strike && !r.attrs;

/**
 * A card's assignee: right-aligned at the card's right inset, the right edge of its box, in
 * `textColor`. Plain text is one `<text text-anchor="end">`, every line ending at that edge. A
 * label with styled runs, an inline box or bullets goes through the writer's label, which has
 * no right alignment: it is left-aligned in its box, so its widest line ends at the edge.
 */
function drawAssignee(scene: Scene, label: PlacedLabel): void {
  const { w, paint } = scene;
  const t = label.text;
  if (t.left || !t.lines.every((line) => line.every(plain))) {
    drawCardLabel(scene, label);
    return;
  }
  const x = label.x + label.width;
  const y = (i: number): number => label.y + i * t.lineHeight + t.baseline;
  const line = (i: number): string => t.lines[i]!.map((r) => r.text).join('') || ' ';
  w.open('g', { class: 'label', fill: paint.text });
  if (t.lines.length === 1) {
    w.open('text', { x, y: y(0), 'text-anchor': 'end' });
    w.text(line(0));
  } else {
    w.open('text', { 'text-anchor': 'end', 'xml:space': 'preserve' });
    for (let i = 0; i < t.lines.length; i++) {
      w.open('tspan', { x, y: y(i) });
      w.text(line(i));
      w.close();
    }
  }
  w.close();
  w.close();
}

function drawCards(scene: Scene): void {
  const { w, layout, paint } = scene;
  if (!paint.card) return;
  w.open('g', { class: 'items' });
  for (const card of layout.cards) drawCard(scene, card, paint.card);
  w.close();
}

/**
 * v12 `kanbanItem`: `g.node` with the card rect, the priority bar, the title, the ticket (a link
 * when `kanban.ticketBaseUrl` gives one that passes `checkUrl`, D377) and the assignee.
 */
function drawCard(scene: Scene, card: CardLayout, rect: CardPaint): void {
  const { w, layout, ctx, items } = scene;
  const item = itemOf(items, card.ast);
  w.open('g', {
    class: `node${userClasses(item.classes)}`,
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
    fill: rect.fill,
    stroke: rect.stroke,
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
  if (card.title) drawCardLabel(scene, card.title);
  if (card.ticket) {
    const href = ticketUrl(item.ticket, ctx);
    if (href) {
      w.open('a', {
        class: 'kanban-ticket-link',
        href,
        target: '_blank',
        'text-decoration': 'underline',
      });
      drawCardLabel(scene, card.ticket);
      w.close();
    } else drawCardLabel(scene, card.ticket);
  }
  if (card.assignee) drawAssignee(scene, card.assignee);
  w.close();
}
