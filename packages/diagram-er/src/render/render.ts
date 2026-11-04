// Draws a laid-out ER diagram through the SvgWriter (DESIGN §7). Structure follows the
// flowchart's (`clusters`, `edgePaths`, `edgeLabels`, `nodes`) with v12's ER class names
// (`relationshipLine`, `outer-path`, `row-rect-odd`/`-even`, `attribute-*`, `divider`); every
// entity, attribute row, relationship and subgraph is one element with `data-id` and
// `data-ast` (R-SVG-2, R-PARSE-8). Colours and sizes come from theme variables only (D152).
import { pxProfile, type LayoutModelNode } from '@mermaid-js/core/layout';
import {
  px,
  styleScope,
  styleText,
  themeStyleSheet,
  translate,
  type Attrs,
  type Paint,
  type SafeValue,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type { ErLayout } from '../layout/layout.ts';
import type { ErRenderContext } from '../layout/context.ts';
import type { EdgeView, EntityView, ErPrepared, GroupView } from '../layout/prepare.ts';
import { prepareEr } from '../layout/prepare.ts';
import type { ErModel } from '../parser/index.ts';
import { drawEnd, lineEnd, routePath, type EndPaint } from './edges.ts';

// The dash of a non-identifying line (v12 `.edge-pattern-dashed`, every theme).
const DASH = '8,8' as SafeValue;
// Room left and right of an edge label inside its background (as the flowchart's).
const LABEL_PAD = 4;
const CELL_CLASSES = ['attribute-type', 'attribute-name', 'attribute-keys', 'attribute-comment'];

const cls = (names: readonly string[]): string => {
  let out = '';
  for (const n of names) {
    const c = n.replace(/[^\w-]/g, '');
    if (c) out += ' ' + c;
  }
  return out;
};

type ThemeOf = ErRenderContext['theme'];
type Color = ReturnType<ThemeOf['color']>;
type Length = ReturnType<ThemeOf['length']>;

interface Tint {
  readonly id: `color-${number}`;
  readonly stroke: Paint;
  readonly fill?: Paint;
}

/**
 * Per-entity palette colour (v12 ER `genColor`, `colorIndex`). On only when the theme carries
 * a non-empty `borderColorArray`, never by theme name (D152). The slot is the entity's
 * declaration order modulo the palette length; the fill (outline and rows) comes from
 * `bkgColorArray` only when that is not empty.
 */
function paletteSlots(theme: ThemeOf): (order: number) => Tint | undefined {
  const border = theme.palette('borderColorArray');
  const bkg = theme.palette('bkgColorArray');
  return (order) => {
    if (border.length === 0) return undefined;
    const slot = order % border.length;
    return {
      id: `color-${slot}`,
      stroke: border[slot]!,
      fill: bkg.length > 0 ? bkg[order % bkg.length] : undefined,
    };
  };
}

interface TablePaint {
  readonly fill: Color;
  readonly stroke: Color;
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
  readonly cluster?: { fill: Color; stroke: Color; strokeWidth: Length; text: Color };
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
    stroke: theme.color('nodeBorder'),
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
          stroke: theme.color('clusterBorder'),
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
    padX: (ctx.units ?? pxProfile).builder.nodePad.x,
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
  const { theme, config } = ctx;
  const prefix = (): string => ctx.idPrefix ?? 'mermaid';
  const width = Math.max(1, Math.ceil(layout.width));
  const height = Math.max(1, Math.ceil(layout.height));
  const maxWidth = config.er?.useMaxWidth !== false;
  const auto = theme.autoDeclarations();
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-er erDiagram',
    viewBox: [0, 0, width, height],
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : height,
    role: 'img',
    'aria-roledescription': 'er',
    'aria-labelledby': title ? `${prefix()}-title` : undefined,
    'aria-describedby': desc ? `${prefix()}-desc` : undefined,
    'data-mermaid-version': ctx.version ?? '13',
    'data-p': auto ? styleScope(prefix()) : undefined,
    style: styleText(maxWidth ? { 'max-width': px(width) } : {}, theme.rootStyleText()),
    'font-family': paint.font,
    'font-size': paint.fontSize,
  });
  if (auto) w.styleSheet(themeStyleSheet(styleScope(prefix()), auto.light, auto.dark));
  if (title) textElement(w, 'title', title, `${prefix()}-title`);
  if (desc) textElement(w, 'desc', desc, `${prefix()}-desc`);
}

function textElement(w: SvgWriter, tag: 'title' | 'desc', text: string, id: string): void {
  w.open(tag, { id });
  w.text(text);
  w.close();
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
  w.leaf('rect', {
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

/** v12's edge id (`getEdgeId` with prefix `id` and the relationship's index `i`). */
const edgeDataId = (e: EdgeView, i: number): string =>
  `id_${e.relationship.from.name}_${e.relationship.to.name}_${i}`;

function drawEdge({ w, layout, paint }: Scene, e: EdgeView, i: number): void {
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
    w.leaf('path', {
      d: routePath(w, route.points),
      stroke: paint.line.stroke,
      'stroke-width': paint.line.strokeWidth,
      'stroke-dasharray': r.identifying ? undefined : DASH,
    });
    // v12: the start marker shows the cardinality written next to `from` (the route's start).
    const start = lineEnd(route.points, true);
    const end = lineEnd(route.points, false);
    if (start) drawEnd(w, r.from.cardinality, start, paint.ends);
    if (end) drawEnd(w, r.to.cardinality, end, paint.ends);
  }
  w.close();
}

function drawEdgeLabel({ w, layout, paint }: Scene, e: EdgeView, i: number): void {
  const at = layout.edges.get(e.id)?.label;
  if (!at || e.label.width === 0) return;
  const lw = e.label.width + 2 * LABEL_PAD;
  w.open('g', { class: 'edgeLabel', 'data-id': edgeDataId(e, i) });
  w.leaf('rect', {
    x: at.x - lw / 2,
    y: at.y - e.label.height / 2,
    width: lw,
    height: e.label.height,
    fill: paint.edgeLabel!.fill,
  });
  w.label(e.label, at.x, at.y, { fill: paint.edgeLabel!.text });
  w.close();
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
  w.leaf('rect', {
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
    w.leaf('rect', {
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
  w.leaf('path', {
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
