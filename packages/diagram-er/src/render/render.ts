// Draws a laid-out ER diagram through the SvgWriter (DESIGN §7). Structure follows the
// flowchart's (`clusters`, `edgePaths`, `edgeLabels`, `nodes`) with v12's ER class names
// (`relationshipLine`, `outer-path`, `row-rect-odd`/`-even`, `attribute-*`, `divider`); every
// entity, attribute row, relationship and subgraph is one element with `data-id` and
// `data-ast` (R-SVG-2, R-PARSE-8). Colours and sizes come from theme variables only (D152).
import type { LayoutModelNode } from '@mermaid-js/core/layout';
import { cls, openSvgRoot, paletteSlots, translate, type Attrs, type OutlinePaint, type Paint, type SafeValue, type SvgWriter } from '@mermaid-js/core/svg';
import { edgeLabel } from '@mermaid-js/core/svg/edges';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type { ErLayout } from '../layout/layout.ts';
import type { ErRenderContext } from '../layout/context.ts';
import type { EdgeView, EntityView, ErPrepared, GroupView } from '../layout/prepare.ts';
import { prepareEr } from '../layout/prepare.ts';
import type { ErModel } from '../parser/index.ts';
import { drawEnd, fitEnds, lineEnd, routePath, type EndPaint, type LineEnd } from './edges.ts';

// The dash of a non-identifying line (v12 `.edge-pattern-dashed`, every theme).
const DASH = '8,8' as SafeValue;
// Room left and right of an edge label inside its background (as the flowchart's).
const CELL_CLASSES = ['attribute-type', 'attribute-name', 'attribute-keys', 'attribute-comment'];

type ThemeOf = ErRenderContext['theme'];
type Color = ReturnType<ThemeOf['color']>;
type Length = ReturnType<ThemeOf['length']>;

interface Tint {
  readonly id: `color-${number}`;
  readonly stroke: Paint;
  readonly fill?: Paint;
}

interface TablePaint {
  readonly fill: Color;
  /**
   * The entity outline and its rules: the theme's gradient when `useGradient` is on (D182, v12
   * neo `erBox.ts`). The rules are one path with the outline, so its box is the entity's and
   * an objectBoundingBox gradient paints it (no lift, unlike class dividers).
   */
  readonly stroke: OutlinePaint;
  readonly strokeWidth: Length;
  readonly text: Color;
  readonly rowOdd?: Color;
  readonly rowEven?: Color;
  /** The theme's drop shadow on entity outlines and subgraph rects; none in classic themes. */
  readonly shadow: ReturnType<ThemeOf['filter']> | undefined;
}

interface Paints {
  readonly font: ReturnType<ThemeOf['font']>;
  readonly fontSize: Length;
  readonly table: TablePaint;
  readonly line?: { stroke: Color; strokeWidth: Length };
  readonly ends?: EndPaint;
  readonly cluster?: { fill: Color; stroke: OutlinePaint; strokeWidth: Length; text: Color };
  readonly edgeLabel?: { fill: Color; text: Color };
  readonly slotOf: (order: number) => Tint | undefined;
}

/**
 * Every theme variable the body uses, looked up before the root is written, so the root
 * `style` declares exactly the aliases used (theme.rootStyle()).
 */
function paints(theme: ThemeOf, er: ErPrepared): Paints {
  const rows = er.entities.some((e) => e.rows.length > 0);
  const table: TablePaint = {
    fill: theme.color('mainBkg'),
    stroke: theme.outline('nodeBorder'),
    // The shared token for outline and rules, not v12 classic's 1.3px (D117).
    strokeWidth: theme.length('strokeWidth'),
    text: theme.color('nodeTextColor'),
    rowOdd: rows ? theme.color('rowOdd') : undefined,
    rowEven: er.entities.some((e) => e.rows.length > 1) ? theme.color('rowEven') : undefined,
    shadow: theme.value('dropShadow') === 'none' ? undefined : theme.filter('dropShadow'),
  };
  const line =
    er.edges.length > 0
      ? { stroke: theme.color('lineColor'), strokeWidth: theme.length('strokeWidth') }
      : undefined;
  // The circle variables are looked up only when a zero end is drawn.
  const zero = er.edges.some(
    (e) =>
      e.relationship.from.cardinality.startsWith('zero') ||
      e.relationship.to.cardinality.startsWith('zero')
  );
  const ends: EndPaint | undefined = line && {
    line: { stroke: line.stroke, 'stroke-width': line.strokeWidth },
    circleFill: zero ? theme.color('erMarkerFill') : undefined,
    manyCircle: zero ? theme.number('erZeroOrMoreCircleOffset') : 0,
  };
  const cluster =
    er.groups.length > 0
      ? {
          fill: theme.color('clusterBkg'),
          // v12 neo `.cluster rect`: the gradient (D182).
          stroke: theme.outline('clusterBorder'),
          strokeWidth: theme.length('clusterStrokeWidth'),
          text: theme.color('titleColor'),
        }
      : undefined;
  const edgeLabel = er.edges.some((e) => e.label.width > 0)
    ? { fill: theme.color('erEdgeLabelBackground'), text: theme.color('textColor') }
    : undefined;
  return {
    font: theme.font(),
    fontSize: theme.length('fontSize'),
    table,
    line,
    ends,
    cluster,
    edgeLabel,
    slotOf: paletteSlots(theme),
  };
}

/** What every section of one render draws from. */
interface Scene {
  readonly w: SvgWriter;
  readonly layout: ErLayout;
  readonly er: ErPrepared;
  readonly ctx: ErRenderContext;
  readonly paint: Paints;
  /** Cell padding across, as the layout measured it. */
  readonly padX: number;
  /** Each edge's start and end, fitted to their neighbours on the same side. */
  readonly ends: ReadonlyMap<string, readonly [LineEnd | undefined, LineEnd | undefined]>;
}

/** The ends of every route, each drawn as wide as its neighbours on that side leave room for. */
function edgeEnds(er: ErPrepared, layout: ErLayout): Scene['ends'] {
  const all: { box: string; end: LineEnd; edge: string; start: boolean }[] = [];
  for (const e of er.edges) {
    const points = layout.edges.get(e.id)?.points;
    if (!points || points.length < 2) continue;
    const start = lineEnd(points, true);
    const end = lineEnd(points, false);
    if (start) all.push({ box: e.source, end: start, edge: e.id, start: true });
    if (end) all.push({ box: e.target, end, edge: e.id, start: false });
  }
  const fitted = fitEnds(all);
  const out = new Map<string, [LineEnd | undefined, LineEnd | undefined]>();
  all.forEach((a, i) => {
    let pair = out.get(a.edge);
    if (!pair) out.set(a.edge, (pair = [undefined, undefined]));
    pair[a.start ? 0 : 1] = fitted[i];
  });
  return out;
}

/** Writes the whole `<svg>` document for a laid-out ER diagram. */
export function renderEr(
  model: ErModel,
  layout: ErLayout,
  ctx: ErRenderContext,
  w: SvgWriter
): void {
  const er = layout.er ?? prepareEr(model, ctx);
  const scene: Scene = {
    w,
    layout,
    er,
    ctx,
    paint: paints(ctx.theme, er),
    padX: er.pad.x,
    ends: edgeEnds(er, layout),
  };
  openRoot(scene, model);
  // v12 numbers edge ids by the relationship's place among all of them.
  const order = new Map(model.relationships.map((r, i) => [r, i]));
  if (scene.paint.cluster) drawClusters(scene);
  w.open('g', { class: 'edgePaths', fill: 'none' });
  for (const e of er.edges) drawEdge(scene, e, order.get(e.relationship) ?? 0);
  w.close();
  w.open('g', { class: 'edgeLabels' });
  if (scene.paint.edgeLabel)
    for (const e of er.edges) drawEdgeLabel(scene, e, order.get(e.relationship) ?? 0);
  w.close();
  w.open('g', { class: 'nodes', fill: scene.paint.table.text });
  for (const view of er.entities) drawEntity(scene, view);
  w.close();
  w.close();
}

/** The `<svg>` root with its title and description (R-A11Y-1). */
function openRoot({ w, layout, ctx, paint }: Scene, model: ErModel): void {
  const { config } = ctx;
  const width = Math.max(1, Math.ceil(layout.width));
  const height = Math.max(1, Math.ceil(layout.height));
  const maxWidth = config.er?.useMaxWidth !== false;
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  openSvgRoot(w, ctx, {
    name: 'er erDiagram',
    viewBox: [0, 0, width, height],
    maxWidth,
    title,
    desc,
    attrs: {
      'font-family': paint.font,
      'font-size': paint.fontSize,
    },
  });
}

function drawClusters({ w, layout, er, ctx, paint }: Scene): void {
  const cluster = paint.cluster!;
  w.open('g', { class: 'clusters' });
  for (const g of er.groups) drawCluster(w, g, layout.groups.get(g.id), ctx, paint, cluster);
  w.close();
}

function drawCluster(
  w: SvgWriter,
  g: GroupView,
  box: ReturnType<ErLayout['groups']['get']>,
  ctx: ErRenderContext,
  paint: Paints,
  cluster: NonNullable<Paints['cluster']>
): void {
  if (!box) return;
  const sg = g.subgraph;
  const fill = g.style.shape.fill;
  w.open('g', {
    class: 'cluster' + cls(sg.classes),
    'data-id': sg.name,
    'data-ast': sg.id,
  });
  w.outline('group', 'rect', {
    x: box.x - box.width / 2,
    y: box.y - box.height / 2,
    width: box.width,
    height: box.height,
    fill: cluster.fill,
    stroke: cluster.stroke,
    'stroke-width': cluster.strokeWidth,
    filter: paint.table.shadow,
    ...g.style.shape,
  });
  w.label(g.label, box.title.x, box.title.y, {
    class: 'cluster-label',
    fill: (fill && ctx.theme.ink(fill)) || cluster.text,
    ...g.style.text,
  });
  w.close();
}

/**
 * The edge's `data-id`: v12's `getEdgeId` shape (prefix `id`, the relationship's index `i`)
 * over the entity names, not v12's entity ids. `CUSTOMER ||--o{ ORDER` is `id_CUSTOMER_ORDER_0`
 * here and was `id_entity-CUSTOMER-0_entity-ORDER-1_0` in v12 (MIGRATION "ER SVG structure").
 */
const edgeDataId = (e: EdgeView, i: number): string =>
  `id_${e.relationship.from.name}_${e.relationship.to.name}_${i}`;

function drawEdge({ w, layout, paint, ends }: Scene, e: EdgeView, i: number): void {
  const r = e.relationship;
  const route = layout.edges.get(e.id);
  w.open('g', {
    class:
      'edge relationshipLine edge-thickness-normal edge-pattern-' +
      (r.identifying ? 'solid' : 'dashed'),
    'data-id': edgeDataId(e, i),
    'data-ast': e.id,
  });
  if (route && route.points.length > 1 && paint.line && paint.ends) {
    w.outline('edge', 'path', {
      d: routePath(w, route.points),
      stroke: paint.line.stroke,
      'stroke-width': paint.line.strokeWidth,
      'stroke-dasharray': r.identifying ? undefined : DASH,
    });
    // v12: the start marker shows the cardinality written next to `from` (the route's start).
    const [start, end] = ends.get(e.id) ?? [];
    if (start) drawEnd(w, r.from.cardinality, start, paint.ends);
    if (end) drawEnd(w, r.to.cardinality, end, paint.ends);
  }
  w.close();
}

function drawEdgeLabel({ w, layout, paint }: Scene, e: EdgeView, i: number): void {
  const at = layout.edges.get(e.id)?.label;
  if (!at || e.label.width === 0) return;
  const { fill, text } = paint.edgeLabel!;
  edgeLabel(w, e.label, at, edgeDataId(e, i), fill, { fill: text });
}

function drawEntity(scene: Scene, view: EntityView): void {
  const { w, layout, ctx, paint } = scene;
  const box: LayoutModelNode | undefined = layout.nodes.get(view.id);
  if (!box) return;
  const slot = paint.slotOf(view.order);
  const t = paint.table;
  const shape = view.style.shape;
  w.open('g', {
    class: 'node' + cls(view.classes),
    'data-id': view.entity.name,
    'data-ast': view.id,
    'data-color-id': slot?.id,
    transform: translate(box.x, box.y),
  });
  const left = -view.width / 2;
  const top = -view.height / 2;
  // The author's `style` / `classDef` still wins over the palette (spread after).
  const outline: Attrs = {
    fill: slot?.fill ?? t.fill,
    stroke: slot?.stroke ?? t.stroke,
    'stroke-width': t.strokeWidth,
    ...shape,
  };
  w.outline('node', 'rect', {
    class: 'outer-path',
    x: left,
    y: top,
    width: view.width,
    height: view.height,
    filter: t.shadow,
    ...outline,
  });
  const ink = shape.fill ? ctx.theme.ink(shape.fill) : undefined;
  const text: Attrs = { fill: ink, ...view.style.text };
  if (view.rows.length === 0) {
    w.label(view.label, 0, 0, { class: 'name', ...text });
    w.close();
    return;
  }
  drawRows(scene, view, slot, left, top, text);
  drawDividers(w, view, outline, left, top);
  const h = view.header;
  w.label(view.label, 0, top + h.at + h.size / 2, { class: 'name', ...text });
  w.close();
}

function drawRows(
  { w, paint, padX }: Scene,
  view: EntityView,
  slot: Tint | undefined,
  left: number,
  top: number,
  text: Attrs
): void {
  const t = paint.table;
  // An author's fill fills every row, in every theme (D117).
  const authorFill = view.style.shape.fill;
  for (let i = 0; i < view.rows.length; i++) {
    const row = view.rows[i]!;
    // v12 counts the name row as row 0, so the first attribute row is odd.
    const even = (i + 1) % 2 === 0;
    w.open('g', {
      class: even ? 'row-rect-even' : 'row-rect-odd',
      'data-id': row.attribute.name,
      'data-ast': row.attribute.id,
    });
    w.outline('part', 'rect', {
      x: left,
      y: top + row.band.at,
      width: view.width,
      height: row.band.size,
      fill: authorFill ?? slot?.fill ?? (even ? t.rowEven : t.rowOdd),
      stroke: 'none',
    });
    const cy = top + row.band.at + row.band.size / 2;
    for (let c = 0; c < 4; c++) {
      const col = view.columns[c]!;
      const cell: MeasuredLabel = row.cells[c]!;
      if (col.size === 0 || cell.width === 0) continue;
      // Cells are left-aligned in their column (v12 erBox).
      const cx = left + col.at + padX + cell.width / 2;
      w.label(cell, cx, cy, { class: CELL_CLASSES[c], ...text });
    }
    w.close();
  }
}

/** The outline, the rule under the name, the rules between rows and between columns in use. */
function drawDividers(
  w: SvgWriter,
  view: EntityView,
  outline: Attrs,
  left: number,
  top: number
): void {
  const right = left + view.width;
  const bottom = top + view.height;
  const under = top + view.header.at + view.header.size;
  const b = w
    .path()
    .moveTo(left, top)
    .lineTo(right, top)
    .lineTo(right, bottom)
    .lineTo(left, bottom)
    .close()
    .moveTo(left, under)
    .lineTo(right, under);
  for (let i = 1; i < view.rows.length; i++) {
    const y = top + view.rows[i]!.band.at;
    b.moveTo(left, y).lineTo(right, y);
  }
  for (let c = 1; c < view.columns.length; c++) {
    const col = view.columns[c]!;
    if (col.size === 0) continue;
    b.moveTo(left + col.at, under).lineTo(left + col.at, bottom);
  }
  w.outline('divider', 'path', {
    class: 'divider',
    d: b.done(),
    fill: 'none',
    stroke: outline.stroke,
    'stroke-width': outline['stroke-width'],
    'stroke-dasharray': outline['stroke-dasharray'],
    'stroke-opacity': outline['stroke-opacity'],
    opacity: outline.opacity,
  });
}
