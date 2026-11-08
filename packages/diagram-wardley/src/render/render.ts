// Draws a laid-out Wardley map through the SvgWriter (spec #430 T4, DESIGN §7). The layout
// (`layoutWardley`) placed everything in the diagram's coordinates; this file only paints it, in
// v12's group order under `g.wardley-map` (`wardleyRenderer.ts`): the background, the title, the
// axes, the stages, the grid, the pipelines and their joins, the links, the trends, the nodes, the
// annotations, the notes, the accelerators and the deaccelerators, with v12's class names. The
// arrowheads are paths at the line ends (R-ARCH-6), not `<defs>` markers, so the SVG holds no id
// but the title's and the description's. A group with nothing to draw is left out.
//
// `data-ast` (R-PARSE-8, pitfall 12) goes on each node's `g.wardley-node`, each link and trend
// line, each pipeline box, note, annotation marker and (de)accelerator outline, the annotation
// box, the in-text title and, for custom stages, the stage group; the parts drawn for them
// (labels, heads, joins) carry the same `data-id` only. Hand-drawn stays plain (D301): every
// shape is a `leaf`, never an `outline`.
import type { RenderContext } from '@mermaid-js/core';
import type { AstId } from '@mermaid-js/core/parser-kit';
import {
  px,
  rotate,
  styleScope,
  styleText,
  themeStyleSheet,
  type Paint,
  type PathBuilder,
  type PathData,
  type SafeValue,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import type { Attrs } from '@mermaid-js/core/svg';
import { wardleyUseMaxWidth } from '../config.ts';
import { BOLD_WEIGHT, WARDLEY_METRICS as metrics } from '../layout/metrics.ts';
import type {
  PlacedText,
  Point,
  Segment,
  Triangle,
  WardleyAcceleratorLayout,
  WardleyLayout,
  WardleyNodeLayout,
} from '../layout/index.ts';
import type { WardleyModel, WardleyStrategy } from '../model.ts';
import { FIXED, paints, type Paints } from './paint.ts';

/** What the renderer reads from the render context. */
export type WardleyRenderContext = Pick<RenderContext, 'config' | 'theme' | 'idPrefix' | 'version'>;

/** What every drawing step reads. */
interface Pen {
  readonly w: SvgWriter;
  readonly paint: Paints;
  readonly layout: WardleyLayout;
}

/** Writes the whole `<svg>` document for a laid-out Wardley map. */
export function renderWardley(
  model: WardleyModel,
  layout: WardleyLayout,
  ctx: WardleyRenderContext,
  w: SvgWriter
): void {
  const pen: Pen = { w, paint: paints(ctx.theme, layout), layout };
  openRoot(model, layout, ctx, w);
  w.open('g', { class: 'wardley-map' });
  drawFrame(model, pen);
  drawPipelines(pen);
  drawLinks(pen);
  drawTrends(pen);
  drawNodes(pen);
  drawAnnotations(pen);
  drawNotes(pen);
  drawAccelerators(pen, 'wardley-accelerators', layout.accelerators);
  drawAccelerators(pen, 'wardley-deaccelerators', layout.deaccelerators);
  w.close();
  w.close();
}

/** A placed text as v12 wrote it: at its anchor, aligned and turned as v12 did. */
function text(w: SvgWriter, t: PlacedText, attrs: Attrs): void {
  w.open('text', {
    ...attrs,
    x: t.at.x,
    y: t.at.y,
    'font-size': t.font.size,
    'font-weight': t.font.weight === BOLD_WEIGHT ? 'bold' : undefined,
    'text-anchor': t.anchor,
    'dominant-baseline': t.baseline === 'auto' ? undefined : t.baseline,
    transform: t.rotate === 0 ? undefined : rotate(t.rotate, t.at.x, t.at.y),
  });
  w.text(t.text);
  w.close();
}

/** A dash pattern from the metrics table (digits and spaces only). */
const dash = (pattern: string): SafeValue => pattern as SafeValue;

/** A straight line's end points as `<line>` attributes. */
const ends = ({ from, to }: Segment) => ({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });

/** A closed polygon as path data. */
function closed(points: readonly Point[], path: PathBuilder): PathData {
  const [first, ...rest] = points;
  path.moveTo(first!.x, first!.y);
  for (const p of rest) path.lineTo(p.x, p.y);
  return path.close().done();
}

/** An arrowhead (v12's marker, `:93-138`) as a filled path. */
function head(w: SvgWriter, triangle: Triangle, cls: string, ast: AstId, fill: Paint): void {
  w.leaf('path', {
    class: cls,
    'data-id': ast,
    d: closed(triangle, w.path()),
    fill,
    stroke: 'none',
  });
}

/** The background, the title, the axes, the stages and the grid (`:140-295`). */
function drawFrame(model: WardleyModel, { w, paint, layout }: Pen): void {
  // The background fills the picture, as v12's canvas-sized one did (the bounds grow past the
  // canvas where something is drawn outside it, D224).
  const { bounds } = layout;
  w.leaf('rect', {
    class: 'wardley-background',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    fill: paint.background,
  });
  if (layout.title) {
    const ast = model.titleAstId;
    text(w, layout.title, {
      class: 'wardley-title',
      'data-id': ast,
      'data-ast': ast,
      fill: paint.axisText,
    });
  }
  const { axes } = layout;
  w.open('g', { class: 'wardley-axes' });
  const axis = { stroke: paint.axis, 'stroke-width': metrics.axis.stroke };
  w.leaf('line', { ...ends(axes.x), ...axis });
  w.leaf('line', { ...ends(axes.y), ...axis });
  text(w, axes.xLabel, {
    class: 'wardley-axis-label wardley-axis-label-x',
    fill: paint.axisText,
  });
  text(w, axes.yLabel, {
    class: 'wardley-axis-label wardley-axis-label-y',
    fill: paint.axisText,
  });
  w.close();

  const evolution = model.evolution?.astId;
  w.open('g', { class: 'wardley-stages', 'data-id': evolution, 'data-ast': evolution });
  for (const stage of layout.stages) {
    // D426: the dividers take the axis colour, where v12 drew `#000` in every theme.
    if (stage.divider)
      w.leaf('line', {
        ...ends(stage.divider),
        stroke: paint.axis,
        'stroke-width': metrics.stage.stroke,
        'stroke-dasharray': dash(metrics.stage.dash),
        opacity: metrics.stage.opacity,
      });
    text(w, stage.label, { class: 'wardley-stage-label', fill: paint.axisText });
  }
  w.close();

  if (layout.grid.length === 0) return;
  w.open('g', { class: 'wardley-grid' });
  for (const line of layout.grid)
    w.leaf('line', {
      ...ends(line),
      stroke: paint.grid,
      'stroke-width': metrics.grid.stroke,
      'stroke-dasharray': dash(metrics.grid.dash),
    });
  w.close();
}

/** The pipeline boxes, then their dashed joins (`:306-380`). */
function drawPipelines({ w, paint, layout }: Pen): void {
  const { pipelines } = layout;
  if (pipelines.length === 0) return;
  const { pipeline } = metrics;
  w.open('g', { class: 'wardley-pipelines' });
  for (const p of pipelines)
    w.leaf('rect', {
      class: 'wardley-pipeline-box',
      'data-id': p.ast,
      'data-ast': p.ast,
      ...p.box,
      fill: 'none',
      stroke: paint.axis,
      'stroke-width': pipeline.stroke,
      rx: pipeline.radius,
      ry: pipeline.radius,
    });
  w.close();
  if (!pipelines.some((p) => p.joins.length > 0)) return;
  w.open('g', { class: 'wardley-pipeline-links' });
  for (const p of pipelines)
    for (const join of p.joins)
      w.leaf('line', {
        class: 'wardley-pipeline-evolution-link',
        'data-id': p.ast,
        ...ends(join),
        stroke: paint.link,
        'stroke-width': pipeline.joinStroke,
        'stroke-dasharray': dash(pipeline.joinDash),
      });
  w.close();
}

/** Each link's line and heads, then the labels (`:382-530`). */
function drawLinks({ w, paint, layout }: Pen): void {
  const { links } = layout;
  if (links.length === 0) return;
  w.open('g', { class: 'wardley-links' });
  for (const link of links) {
    w.leaf('line', {
      class: link.dashed ? 'wardley-link wardley-link--dashed' : 'wardley-link',
      'data-id': link.ast,
      'data-ast': link.ast,
      ...ends(link),
      stroke: paint.link,
      'stroke-width': metrics.link.stroke,
      'stroke-dasharray': link.dashed ? dash(metrics.link.dash) : undefined,
    });
    if (link.heads.start) head(w, link.heads.start, 'wardley-link-head', link.ast, paint.link);
    if (link.heads.end) head(w, link.heads.end, 'wardley-link-head', link.ast, paint.link);
  }
  for (const link of links)
    if (link.label)
      text(w, link.label, {
        class: 'wardley-link-label',
        'data-id': link.ast,
        fill: paint.axisText,
      });
  w.close();
}

/** Each `evolve`'s dashed line and head (`:532-582`). */
function drawTrends({ w, paint, layout }: Pen): void {
  const { trends } = layout;
  if (trends.length === 0) return;
  w.open('g', { class: 'wardley-trends' });
  for (const trend of trends) {
    w.leaf('line', {
      class: 'wardley-trend',
      'data-id': trend.ast,
      'data-ast': trend.ast,
      ...ends(trend),
      stroke: paint.evolution,
      'stroke-width': metrics.trend.stroke,
      'stroke-dasharray': dash(metrics.trend.dash),
    });
    head(w, trend.head, 'wardley-trend-head', trend.ast, paint.evolution);
  }
  w.close();
}

/** v12's overlay class and fill for each strategy (`:597-644`). */
const OVERLAYS: Readonly<Record<WardleyStrategy, { cls: string; fill: Paint }>> = {
  outsource: { cls: 'wardley-outsource-overlay', fill: FIXED.outsource },
  buy: { cls: 'wardley-buy-overlay', fill: FIXED.buy },
  build: { cls: 'wardley-build-overlay', fill: FIXED.build },
  market: { cls: 'wardley-market-overlay', fill: FIXED.white },
};

/** The nodes, in model order (`:584-823`). */
function drawNodes(pen: Pen): void {
  const { w, layout } = pen;
  if (layout.nodes.length === 0) return;
  w.open('g', { class: 'wardley-nodes' });
  for (const node of layout.nodes) drawNode(pen, node);
  w.close();
}

/**
 * One node's group, its parts in v12's order: the strategy overlay, the circle, the market
 * marks, the square, the inertia bar and the label.
 */
function drawNode({ w, paint }: Pen, node: WardleyNodeLayout): void {
  const { point, overlay, market, inertia } = node;
  const stroke = { stroke: paint.componentStroke, 'stroke-width': metrics.node.stroke };
  w.open('g', {
    class: `wardley-node wardley-node--${node.className}`,
    'data-id': node.ast,
    'data-ast': node.ast,
  });
  if (overlay) {
    const { cls, fill } = OVERLAYS[overlay.strategy];
    w.leaf('circle', {
      class: cls,
      cx: point.x,
      cy: point.y,
      r: overlay.radius,
      fill,
      ...stroke,
      // v12 strokes the build overlay black in every theme (D426 keeps it).
      ...(overlay.strategy === 'build' ? { stroke: FIXED.buildStroke } : {}),
    });
  }
  if (node.glyph === 'circle')
    w.leaf('circle', {
      cx: point.x,
      cy: point.y,
      r: node.radius,
      fill: paint.componentFill,
      ...stroke,
    });
  if (market) {
    const [a, b, c] = market.dots;
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const)
      w.leaf('line', { class: 'wardley-market-line', ...ends({ from, to }), ...stroke });
    for (const dot of market.dots)
      w.leaf('circle', {
        class: 'wardley-market-dot',
        cx: dot.x,
        cy: dot.y,
        r: market.radius,
        fill: FIXED.white,
        stroke: paint.componentStroke,
        'stroke-width': metrics.node.dotStroke,
      });
  }
  if (node.glyph === 'square')
    w.leaf('rect', {
      x: point.x - node.radius,
      y: point.y - node.radius,
      width: node.radius * 2,
      height: node.radius * 2,
      fill: paint.componentFill,
      ...stroke,
    });
  if (inertia)
    w.leaf('line', {
      class: 'wardley-inertia',
      ...ends(inertia.line),
      stroke: paint.componentStroke,
      'stroke-width': inertia.width,
    });
  // D426: an anchor's label takes the axis text colour, where v12 drew `#000` in every theme.
  text(w, node.label, {
    class: 'wardley-node-label',
    'data-id': node.ast,
    fill: node.className === 'anchor' ? paint.axisText : paint.componentLabel,
  });
  w.close();
}

/**
 * The annotation markers, then the annotation box (`:825-956`). D426: both take the three
 * annotation variables, where v12 drew them white with the axis colours.
 */
function drawAnnotations({ w, paint, layout }: Pen): void {
  const { annotations, annotationsBox: box } = layout;
  if (annotations.length === 0 && !box) return;
  const { annotation } = metrics;
  w.open('g', { class: 'wardley-annotations' });
  for (const a of annotations) {
    w.open('g', { class: 'wardley-annotation', 'data-id': a.ast, 'data-ast': a.ast });
    w.leaf('circle', {
      cx: a.point.x,
      cy: a.point.y,
      r: a.radius,
      fill: paint.annotationFill,
      stroke: paint.annotationStroke,
      'stroke-width': annotation.stroke,
    });
    text(w, a.label, { 'data-id': a.ast, fill: paint.annotationText });
    w.close();
  }
  if (box) {
    w.open('g', { class: 'wardley-annotations-box', 'data-id': box.ast, 'data-ast': box.ast });
    w.leaf('rect', {
      ...box.box,
      fill: paint.annotationFill,
      stroke: paint.annotationStroke,
      'stroke-width': annotation.boxStroke,
      rx: annotation.boxRadius,
      ry: annotation.boxRadius,
    });
    for (const line of box.lines) text(w, line, { fill: paint.annotationText });
    w.close();
  }
  w.close();
}

/** The notes (`:958-976`). */
function drawNotes({ w, paint, layout }: Pen): void {
  if (layout.notes.length === 0) return;
  w.open('g', { class: 'wardley-notes' });
  for (const note of layout.notes)
    text(w, note.label, { 'data-id': note.ast, 'data-ast': note.ast, fill: paint.axisText });
  w.close();
}

/** The (de)accelerators: each outline, then its label (`:978-1066`). */
function drawAccelerators(
  { w, paint }: Pen,
  cls: string,
  arrows: readonly WardleyAcceleratorLayout[]
): void {
  if (arrows.length === 0) return;
  w.open('g', { class: cls });
  for (const arrow of arrows) {
    w.leaf('path', {
      'data-id': arrow.ast,
      'data-ast': arrow.ast,
      d: closed(arrow.outline, w.path()),
      fill: FIXED.white,
      stroke: paint.componentStroke,
      'stroke-width': metrics.accelerator.stroke,
    });
    text(w, arrow.label, { 'data-id': arrow.ast, fill: paint.axisText });
  }
  w.close();
}

/** The `<svg>` root with its title and description (R-A11Y-1, D133). */
function openRoot(
  model: WardleyModel,
  layout: WardleyLayout,
  ctx: WardleyRenderContext,
  w: SvgWriter
): void {
  const { theme, config } = ctx;
  const prefix = ctx.idPrefix;
  const { x, y } = layout.bounds;
  const width = Math.max(1, Math.ceil(layout.bounds.width));
  const height = Math.max(1, Math.ceil(layout.bounds.height));
  const section = config['wardley-beta'] as Readonly<Record<string, unknown>> | undefined;
  const maxWidth = wardleyUseMaxWidth(section);
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  // Read before the root style is written, so it declares its alias.
  const font = theme.font();
  const auto = theme.autoDeclarations();
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-wardley',
    viewBox: [x, y, width, height],
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : height,
    role: 'img',
    'aria-roledescription': 'wardley',
    'aria-labelledby': title ? `${prefix}-title` : undefined,
    'aria-describedby': desc ? `${prefix}-desc` : undefined,
    'data-mermaid-version': ctx.version,
    'data-p': auto ? styleScope(prefix) : undefined,
    style: styleText(maxWidth ? { 'max-width': px(width) } : {}, theme.rootStyleText()),
    'font-family': font,
  });
  if (auto) w.styleSheet(themeStyleSheet(styleScope(prefix), auto.light, auto.dark));
  if (title) textElement(w, 'title', title, `${prefix}-title`);
  if (desc) textElement(w, 'desc', desc, `${prefix}-desc`);
}

function textElement(w: SvgWriter, tag: 'title' | 'desc', content: string, id: string): void {
  w.open(tag, { id });
  w.text(content);
  w.close();
}
