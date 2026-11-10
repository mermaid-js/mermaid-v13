/**
 * Draws a laid-out venn diagram through the SvgWriter (spec #429 T4, DESIGN §7). The layout
 * (`layoutVenn`) measured and placed everything; this file only paints it, in v12's order and
 * with v12's classes (`vennRenderer.ts`): `text.venn-title`, then one group translated by the
 * title row holding each area's `g.venn-area` (`venn-circle venn-set-<slot>` for a set,
 * `venn-intersection` for an overlap, each with `data-venn-sets`: a `path` and its `text.label`),
 * then `g.venn-text-nodes` holding a `g.venn-text-area` of `text.venn-text-node`s where v12 drew
 * `foreignObject` spans (D414). No `<style>` (but `theme: 'auto'`'s) and no `foreignObject`.
 *
 * `data-ast` marks one element per drawn AST node (pitfall 12): each set's and overlap's
 * `g.venn-area` and each text node. Labels and the title carry `data-id` only, and the only
 * element ids are `<id>-title` (venn has no `accTitle`, so its title names the diagram, D133).
 * Circles, and an overlap a style fills, go through `w.outline` (D319): the hand-drawn plugin
 * sketches them; without it they are plain paths. An area the solver could not place on the
 * chart (venn.js's `disjoint`) is not drawn.
 */
import {
  fixedPaint,
  openSvgRoot,
  translate,
  type Attrs,
  type Paint,
  type PathData,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import type {
  PlacedLabel,
  RegionPath,
  VennAreaLayout,
  VennLayout,
  VennOverlapLayout,
  VennSetLayout,
  VennTextArea,
} from '../layout/index.ts';
import type { VennModel } from '../model.ts';
import type { VennRenderContext } from './context.ts';
import { VENN_PAINT, vennPaints, type CirclePaint, type OverlapPaint } from './paint.ts';

/** An area with an outline: one the solver placed on the chart. */
type Outlined<A extends VennAreaLayout = VennAreaLayout> = A & { readonly path: RegionPath };

const outlined = (a: VennAreaLayout): a is Outlined => a.path !== undefined;

/** An area to draw with its paint, read before the root. */
type PaintedArea =
  | { readonly area: Outlined<VennSetLayout>; readonly circle: CirclePaint }
  | { readonly area: Outlined<VennOverlapLayout>; readonly overlap: OverlapPaint };

interface Scene {
  readonly w: SvgWriter;
  readonly layout: VennLayout;
  readonly areas: readonly PaintedArea[];
  readonly textNodes: readonly (readonly Paint[])[];
}

/** Writes the whole `<svg>` document for a laid-out venn diagram. */
export function renderVenn(
  model: VennModel,
  layout: VennLayout,
  ctx: VennRenderContext,
  w: SvgWriter
): void {
  // Every theme variable is read before the root, so its style declares them.
  const paints = vennPaints(ctx);
  const areas = layout.areas
    .filter(outlined)
    .map(
      (area): PaintedArea =>
        area.kind === 'set'
          ? { area, circle: paints.circle(area.style, area.index) }
          : { area, overlap: paints.overlap(area.style) }
    );
  const textNodes = layout.textAreas.map((t) => t.nodes.map((n) => paints.textNode(n.style)));
  const titleInk = layout.title && paints.title();
  const scene: Scene = { w, layout, areas, textNodes };
  openRoot(model, scene, ctx);
  if (layout.title && titleInk)
    label(w, layout.title, {
      class: 'venn-title',
      'data-id': 'title',
      'font-size': layout.fonts.title.size,
      fill: titleInk,
    });
  w.open('g', { transform: translate(layout.offset.x, layout.offset.y) });
  for (const d of areas) drawArea(scene, d);
  if (model.textNodes.length > 0) drawTextNodes(scene);
  w.close();
  w.close();
}

/** A region's outline as path data. */
function pathData(w: SvgWriter, p: RegionPath): PathData {
  const b = w.path().moveTo(p.start.x, p.start.y);
  for (const a of p.arcs) b.arcTo(a.radius, a.radius, 0, a.large, a.sweep, a.to.x, a.to.y);
  return b.done();
}

/** One `g.venn-area`: the outline, then the label (v12's order). */
function drawArea({ w, layout }: Scene, d: PaintedArea): void {
  const { area } = d;
  const id = area.sets.join('_');
  w.open('g', {
    class:
      area.kind === 'set'
        ? `venn-area venn-circle venn-set-${area.slot}`
        : 'venn-area venn-intersection',
    'data-venn-sets': id,
    'data-id': id,
    'data-ast': area.ast,
  });
  const dPath = pathData(w, area.path);
  let ink: Paint;
  if ('circle' in d) {
    const c = d.circle;
    w.outline('node', 'path', {
      d: dPath,
      fill: c.fill,
      'fill-opacity': c.fillOpacity,
      stroke: c.stroke,
      'stroke-width': d.area.circle.strokeWidth,
      'stroke-opacity': VENN_PAINT.circleStrokeOpacity,
    });
    ink = c.label;
  } else {
    const o = d.overlap;
    if (o.fill)
      w.outline('node', 'path', {
        d: dPath,
        fill: o.fill,
        'fill-opacity': VENN_PAINT.overlapFillOpacity,
      });
    else w.leaf('path', { d: dPath, fill: 'transparent', 'fill-opacity': 0 });
    ink = o.label;
  }
  if (area.label)
    label(w, area.label, {
      class: 'label',
      'data-id': id,
      'font-size': layout.fonts.label.size,
      fill: ink,
    });
  w.close();
}

/** v12 `renderTextNodes`: each area's text nodes, with `useDebugLayout`'s shapes. */
function drawTextNodes({ w, layout, textNodes }: Scene): void {
  const debug = layout.debug;
  const dash = (d: readonly number[]): string => d.map((n) => n * layout.scale).join(' ');
  w.open('g', { class: 'venn-text-nodes' });
  layout.textAreas.forEach((t: VennTextArea, k) => {
    w.open('g', { class: 'venn-text-area', 'font-size': layout.fonts.text.size });
    if (debug)
      w.leaf('circle', {
        class: 'venn-text-debug-circle',
        cx: t.inner.x,
        cy: t.inner.y,
        r: t.inner.radius,
        fill: 'none',
        stroke: fixedPaint(VENN_PAINT.debugCircle),
        'stroke-width': debug.circleStroke,
        'stroke-dasharray': dash(VENN_PAINT.debugCircleDash) as Attrs['stroke-dasharray'],
      });
    t.nodes.forEach((n, i) => {
      if (debug)
        w.leaf('rect', {
          class: 'venn-text-debug-cell',
          x: n.cell.x,
          y: n.cell.y,
          width: n.cell.width,
          height: n.cell.height,
          fill: 'none',
          stroke: fixedPaint(VENN_PAINT.debugCell),
          'stroke-width': debug.cellStroke,
          'stroke-dasharray': dash(VENN_PAINT.debugCellDash) as Attrs['stroke-dasharray'],
        });
      label(w, n.label, {
        class: 'venn-text-node',
        'data-id': n.id,
        'data-ast': n.ast,
        fill: textNodes[k]![i]!,
      });
    });
    w.close();
  });
  w.close();
}

/** A placed label, centred in its box. */
function label(w: SvgWriter, p: PlacedLabel, attrs: Attrs): void {
  w.label(p.text, p.x + p.width / 2, p.y + p.height / 2, attrs);
}

/** The `<svg>` root with its title (R-A11Y-1, D133). */
function openRoot(model: VennModel, { w, layout }: Scene, ctx: VennRenderContext): void {
  const { theme, config } = ctx;
  const { x, y } = layout.bounds;
  const width = Math.max(1, Math.ceil(layout.bounds.width));
  const height = Math.max(1, Math.ceil(layout.bounds.height));
  const maxWidth = (config.venn as { useMaxWidth?: unknown } | undefined)?.useMaxWidth !== false;
  const title = model.title?.trim();
  // Read before the root style is written, so it declares its alias.
  const font = theme.font();
  openSvgRoot(w, ctx, {
    name: 'venn',
    viewBox: [x, y, width, height],
    maxWidth,
    title,
    attrs: { 'font-family': font },
  });
}
