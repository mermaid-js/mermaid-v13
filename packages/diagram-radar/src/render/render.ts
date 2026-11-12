// Draws a laid-out radar chart through the SvgWriter (spec #422 T4, DESIGN §7). The layout
// (`layoutRadar`) placed everything in the diagram's coordinates; this file only paints it, in
// v12's order: the graticule rings, the axes with their labels, the curves, the legend, the
// title. v12's class names are kept (`radarGraticule`, `radarAxisLine`, `radarAxisLabel`,
// `radarCurve-<slot>`, `radarLegendBox-<slot>`, `radarLegendText`, `radarTitle`). Each axis's
// `<g>`, each drawn curve and the in-text title carry `data-ast`; legend rows and swatches
// carry `data-id` only (pitfall 12). A skipped curve draws nothing, as pie's dropped slices.
import type { RenderContext } from '@mermaid-js/core';
import type { PathBuilder, PathData, SvgWriter } from '@mermaid-js/core/svg';
import { openSvgRoot } from '@mermaid-js/core/svg/document';
import type { CubicSegment, PlacedLabel, Point, RadarLayout } from '../layout/index.ts';
import type { RadarModel } from '../model.ts';
import { radarUseMaxWidth } from '../config.ts';
import { paints, type Paints } from './paint.ts';

/** What the renderer reads from the render context. */
export type RadarRenderContext = Pick<RenderContext, 'config' | 'theme' | 'idPrefix' | 'version'>;

/** Writes the whole `<svg>` document for a laid-out radar chart. */
export function renderRadar(
  model: RadarModel,
  layout: RadarLayout,
  ctx: RadarRenderContext,
  w: SvgWriter
): void {
  const paint = paints(ctx.theme, layout);
  openRoot(model, layout, ctx, w);
  drawRings(layout, paint, w);
  drawSpokes(layout, paint, w);
  drawCurves(layout, paint, w);
  drawLegend(layout, paint, w);
  if (layout.title) {
    const ast = model.titleAstId;
    w.label(layout.title.text, centreX(layout.title), centreY(layout.title), {
      class: 'radarTitle',
      'data-id': ast,
      'data-ast': ast,
      fill: paint.text,
      'font-size': layout.fonts.title.size,
    });
  }
  w.close();
}

const centreX = (r: PlacedLabel): number => r.x + r.width / 2;
const centreY = (r: PlacedLabel): number => r.y + r.height / 2;
const flat = (points: readonly Point[]): number[] => points.flatMap((p) => [p.x, p.y]);

/** v12 `drawGraticule`: a circle or a polygon per ring, filled at `radarGraticuleOpacity`. */
function drawRings(layout: RadarLayout, paint: Paints, w: SvgWriter): void {
  const { center } = layout;
  const attrs = {
    class: 'radarGraticule',
    fill: paint.graticule,
    'fill-opacity': paint.graticuleOpacity,
    stroke: paint.graticule,
    'stroke-width': layout.strokes.graticule,
  };
  for (const ring of layout.rings)
    if (ring.points.length === 0)
      w.leaf('circle', { ...attrs, cx: center.x, cy: center.y, r: ring.radius });
    else w.leaf('polygon', { ...attrs, points: flat(ring.points) });
}

/** v12 `drawAxes`: per axis a `<g>` with its line from the centre and its label. */
function drawSpokes(layout: RadarLayout, paint: Paints, w: SvgWriter): void {
  const { center } = layout;
  for (const spoke of layout.spokes) {
    w.open('g', { 'data-id': spoke.ast, 'data-ast': spoke.ast });
    w.leaf('line', {
      class: 'radarAxisLine',
      x1: center.x,
      y1: center.y,
      x2: spoke.end.x,
      y2: spoke.end.y,
      stroke: paint.axis,
      'stroke-width': layout.strokes.axis,
    });
    w.label(spoke.label.text, centreX(spoke.label), centreY(spoke.label), {
      class: 'radarAxisLabel',
      fill: paint.text,
      'font-size': layout.fonts.axis.size,
    });
    w.close();
  }
}

/**
 * The path data of a closed curve under a `circle` graticule (v12 `closedRoundCurve`): `M` to
 * the first point, one `C` per segment, `Z`.
 */
export function curvePath(
  points: readonly Point[],
  segments: readonly CubicSegment[],
  path: PathBuilder
): PathData {
  const first = points[0]!;
  path.moveTo(first.x, first.y);
  for (const { c1, c2, to } of segments) path.curveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y);
  return path.close().done();
}

/** v12 `drawCurves`: each drawn curve as a closed round path (`circle`) or a polygon. */
function drawCurves(layout: RadarLayout, paint: Paints, w: SvgWriter): void {
  for (const curve of layout.curves) {
    const fill = paint.slot(curve.slot);
    const attrs = {
      class: `radarCurve-${curve.slot}`,
      'data-id': curve.ast,
      'data-ast': curve.ast,
      fill,
      'fill-opacity': paint.curveOpacity,
      stroke: fill,
      'stroke-width': layout.strokes.curve,
    };
    if (layout.graticule === 'circle')
      w.leaf('path', { ...attrs, d: curvePath(curve.points, curve.segments, w.path()) });
    else w.leaf('polygon', { ...attrs, points: flat(curve.points) });
  }
}

/** v12 `drawLegend`: one row per curve, a swatch and its left-aligned label. */
function drawLegend(layout: RadarLayout, paint: Paints, w: SvgWriter): void {
  for (const row of layout.legend) {
    const fill = paint.slot(row.slot);
    w.open('g', { 'data-id': row.ast });
    // v12 strokes the swatch at the default width, 1.
    w.leaf('rect', {
      class: `radarLegendBox-${row.slot}`,
      'data-id': row.ast,
      ...row.swatch,
      fill,
      'fill-opacity': paint.curveOpacity,
      stroke: fill,
    });
    w.label({ ...row.label.text, left: true }, centreX(row.label), centreY(row.label), {
      class: 'radarLegendText',
      fill: paint.text,
      'font-size': layout.fonts.legend.size,
    });
    w.close();
  }
}

/** The `<svg>` root with its title and description (R-A11Y-1, D133). */
function openRoot(
  model: RadarModel,
  layout: RadarLayout,
  ctx: RadarRenderContext,
  w: SvgWriter
): void {
  const { theme, config } = ctx;
  const { x, y } = layout.bounds;
  const width = Math.max(1, Math.ceil(layout.bounds.width));
  const height = Math.max(1, Math.ceil(layout.bounds.height));
  const maxWidth = radarUseMaxWidth(config.radar);
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  // Read before the root style is written, so it declares its alias.
  const font = theme.font();
  openSvgRoot(w, ctx, {
    name: 'radar',
    viewBox: [x, y, width, height],
    maxWidth,
    title,
    desc,
    attrs: {
      'font-family': font,
    },
  });
}
