/**
 * The wardley custom layout (spec #430 T3, `layoutKind: 'custom'`): `WardleyModel` in,
 * `WardleyLayout` out. It follows v12's `wardleyRenderer.ts` with the drawing taken out (line
 * numbers are `git show fa796a943:packages/mermaid/src/diagrams/wardley/wardleyRenderer.ts`'s):
 * the canvas and the projection, the stages and the grid, the pipelines (which move their
 * parents, in model order, before anything else reads a position), the links, the trends, the
 * nodes, the annotations, the notes and the (de)accelerators. Every text is measured through
 * the injected measurer in the theme's font family (D422, pitfall 16) and placed where v12's
 * `text-anchor` and `dominant-baseline` put it; the bounds grow past v12's canvas wherever
 * something drawn reaches out of it (D224). Lengths come from the `wardley-beta` config, the
 * map's `size` and the metrics table (pitfall 13).
 *
 * Never NaN (D424, D226): a config value below its schema minimum or a `size` of 0 falls back
 * (`WARDLEY_CONFIG_INVALID`), custom stage boundaries are clamped to [0, 1]
 * (`WARDLEY_STAGE_CLAMPED`), and a link whose ends coincide is dropped, as are self-links and
 * links to an unknown name (v12 wrote NaN for the first two; the parser warns about them,
 * `WARDLEY_LINK_DROPPED`). A link from a pipeline child to its own parent is skipped without a
 * warning, as v12's renderer did (`:390-403`).
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import { layoutLabel, type FontKey, type Measurer } from '@mermaid-js/core/text';
import { wardleyLayoutConfig, type WardleyLayoutConfig, type WardleySize } from '../config.ts';
import type { WardleyAccelerator, WardleyModel, WardleyNode } from '../model.ts';
import { Box, HALF_TURN } from './geometry.ts';
import {
  AXIS_LABELS,
  BOLD_WEIGHT,
  DEFAULT_STAGES,
  NORMAL_WEIGHT,
  WARDLEY_METRICS as M,
} from './metrics.ts';
import type {
  PlacedText,
  Point,
  Segment,
  Triangle,
  WardleyAcceleratorLayout,
  WardleyAnnotationsBoxLayout,
  WardleyBaseline,
  WardleyLayout,
  WardleyLinkLayout,
  WardleyNodeLayout,
  WardleyPipelineLayout,
  WardleyStageLayout,
  WardleyTextAnchor,
  WardleyTrendLayout,
} from './types.ts';

/** What the layout reads from the render context. */
export type WardleyLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'warn'>>;

export const WARDLEY_STAGE_CLAMPED = 'WARDLEY_STAGE_CLAMPED';

/** For a layout run without a `warn` sink (unit tests, the invariants). */
const ignoreWarning = (): void => undefined;

type Fonts = WardleyLayout['fonts'];
type Place = (
  text: string,
  font: FontKey,
  at: Point,
  anchor: WardleyTextAnchor,
  baseline: WardleyBaseline,
  rotate?: number
) => PlacedText;

/** The chart's frame: v12's `projectX` and `projectY` (`:165-166`). */
interface Frame {
  readonly c: WardleyLayoutConfig;
  readonly chartWidth: number;
  readonly chartHeight: number;
  /** Evolution 0–100 to x. */
  x(evolution: number): number;
  /** Visibility 0–100 to y. */
  y(visibility: number): number;
}

/** What the node, pipeline and link steps share. */
interface Env {
  readonly c: WardleyLayoutConfig;
  /** A pipeline parent's square: `squareFactor · nodeRadius`. */
  readonly square: number;
  readonly fonts: Fonts;
  readonly place: Place;
  /** Each node's centre, which the pipelines move. */
  readonly positions: Map<string, Point>;
  readonly byId: ReadonlyMap<string, WardleyNode>;
}

/** Lays out a Wardley map in px. */
export function layoutWardley(model: WardleyModel, ctx: WardleyLayoutContext): WardleyLayout {
  const warn = ctx.warn ?? ignoreWarning;
  const section = ctx.config['wardley-beta'] as Readonly<Record<string, unknown>> | undefined;
  const c = wardleyLayoutConfig(section, model.size as WardleySize | undefined, warn);
  const { width: W, height: H, padding: p } = c;
  const chartWidth = W - p * 2;
  const chartHeight = H - p * 2;
  const frame: Frame = {
    c,
    chartWidth,
    chartHeight,
    x: (v) => p + (v / 100) * chartWidth,
    y: (v) => H - p - (v / 100) * chartHeight,
  };

  const fonts = fontsOf(c, ctx.theme.value('fontFamily'));
  const place = placer(ctx.measurer);

  const title = model.title
    ? place(model.title, fonts.title, { x: W / 2, y: p * M.title.yFactor }, 'middle', 'middle')
    : undefined;
  const yLabelAt = { x: p * M.axis.yLabelFactor, y: p + chartHeight / 2 };
  const axes = {
    x: { from: { x: p, y: H - p }, to: { x: W - p, y: H - p } },
    y: { from: { x: p, y: p }, to: { x: p, y: H - p } },
    xLabel: place(
      AXIS_LABELS.x,
      fonts.axis,
      { x: p + chartWidth / 2, y: H - p * M.axis.xLabelFactor },
      'middle',
      'auto'
    ),
    yLabel: place(AXIS_LABELS.y, fonts.axis, yLabelAt, 'middle', 'auto', M.axis.yLabelRotate),
  };
  const stages = stagesOf(model, frame, fonts, place, warn);
  const grid = c.showGrid ? gridOf(frame) : [];

  // Positions (`:297-304`), which the pipelines then move.
  const positions = new Map<string, Point>();
  const byId = new Map<string, WardleyNode>();
  for (const node of model.nodes) {
    positions.set(node.id, { x: frame.x(node.x), y: frame.y(node.y) });
    byId.set(node.id, node);
  }
  const env: Env = {
    c,
    square: c.nodeRadius * M.pipeline.squareFactor,
    fonts,
    place,
    positions,
    byId,
  };
  const pipelines = pipelinesOf(model, env);
  const links = linksOf(model, env);
  const trends = trendsOf(model, positions, frame);
  const nodes = model.nodes.map((node) => nodeOf(node, positions.get(node.id)!, env));

  const annotations = model.annotations.map((a) => {
    const point = { x: frame.x(a.x), y: frame.y(a.y) };
    return {
      ast: a.astId,
      number: a.number,
      point,
      radius: M.annotation.radius,
      label: place(String(a.number), fonts.annotationNumber, point, 'middle', 'central'),
    };
  });
  const annotationsBox = annotationsBoxOf(model, frame, fonts, place);
  const notes = model.notes.map((n) => ({
    ast: n.astId,
    label: place(n.text, fonts.note, { x: frame.x(n.x), y: frame.y(n.y) }, 'start', 'auto'),
  }));
  const accelerators = model.accelerators.map((a) => acceleratorOf(a, false, frame, fonts, place));
  const deaccelerators = model.deaccelerators.map((a) =>
    acceleratorOf(a, true, frame, fonts, place)
  );

  const layout: Omit<WardleyLayout, 'bounds'> = {
    width: W,
    height: H,
    padding: p,
    nodeRadius: c.nodeRadius,
    chart: { x: p, y: p, width: chartWidth, height: chartHeight },
    ...(title ? { title } : {}),
    axes,
    stages,
    grid,
    pipelines,
    links,
    trends,
    nodes,
    annotations,
    ...(annotationsBox ? { annotationsBox } : {}),
    notes,
    accelerators,
    deaccelerators,
    fonts,
  };
  return { ...layout, bounds: boundsOf(layout) };
}

/** The fonts (D422: the theme's family; v12's sizes and weights). */
function fontsOf(c: WardleyLayoutConfig, family: string): Fonts {
  const font = (size: number, weight = NORMAL_WEIGHT): FontKey => ({
    family,
    size: Math.max(0, size),
    weight,
  });
  return {
    title: font(c.axisFontSize * M.title.fontScale, BOLD_WEIGHT),
    axis: font(c.axisFontSize, BOLD_WEIGHT),
    stage: font(c.axisFontSize - M.stage.fontDelta),
    node: font(c.labelFontSize),
    anchor: font(c.labelFontSize, BOLD_WEIGHT),
    link: font(c.labelFontSize),
    annotationNumber: font(M.annotation.numberFontSize, BOLD_WEIGHT),
    annotation: font(M.annotation.fontSize),
    note: font(M.note.fontSize, BOLD_WEIGHT),
    accelerator: font(M.accelerator.fontSize, BOLD_WEIGHT),
  };
}

/** How far left of its anchor a text's box starts, in text widths. */
const ANCHOR_SHIFT: Readonly<Record<WardleyTextAnchor, number>> = { start: 0, middle: 1 / 2 };

/**
 * Measures a text in `font` and boxes it on `at` as v12's `text-anchor` and `dominant-baseline`
 * place one line; more lines grow up from an `auto` baseline, both ways about the others.
 */
function placer(measurer: Measurer): Place {
  return (source, font, at, anchor, baseline, rotate = 0) => {
    const text = layoutLabel(source, font, Infinity, measurer);
    const extra = Math.max(0, text.height - text.lineHeight);
    const y = baseline === 'auto' ? at.y - text.baseline - extra : at.y - text.height / 2;
    return {
      x: at.x - ANCHOR_SHIFT[anchor] * text.width,
      y,
      width: text.width,
      height: text.height,
      text,
      font,
      at,
      anchor,
      baseline,
      rotate,
    };
  };
}

/**
 * The stages (`:214-271`): the author's or v12's four; custom widths only when every stage has
 * a boundary, each clamped to [0, 1] (D424, one warning); else equal widths.
 */
function stagesOf(
  model: WardleyModel,
  frame: Frame,
  fonts: Fonts,
  place: Place,
  warn: (w: Warning) => void
): WardleyStageLayout[] {
  const { c, chartWidth } = frame;
  const evolution = model.evolution;
  const names = evolution && evolution.stages.length > 0 ? evolution.stages : DEFAULT_STAGES;
  const spans: [number, number][] = [];
  const boundaries = evolution?.boundaries ?? [];
  if (evolution && boundaries.length === names.length) {
    const clamped = boundaries.map((b) => Math.min(1, Math.max(0, b)));
    if (clamped.some((b, i) => b !== boundaries[i]))
      warn({
        code: WARDLEY_STAGE_CLAMPED,
        message: `evolution boundaries ${boundaries.join(', ')} are not all between 0 and 1; drawing ${clamped.join(', ')}`,
        astIds: [evolution.astId],
      });
    let previous = 0;
    for (const b of clamped) {
      spans.push([previous, b]);
      previous = b;
    }
  } else {
    const share = 1 / names.length;
    names.forEach((_, i) => spans.push([i * share, (i + 1) * share]));
  }
  const top = c.padding;
  const bottom = c.height - c.padding;
  const labelY = c.height - c.padding / M.stage.labelDivisor;
  return names.map((name, i) => {
    const [from, to] = spans[i]!;
    const start = c.padding + from * chartWidth;
    const end = c.padding + to * chartWidth;
    const label = place(name, fonts.stage, { x: (start + end) / 2, y: labelY }, 'middle', 'auto');
    const divider = { from: { x: start, y: top }, to: { x: start, y: bottom } };
    return { start, end, label, ...(i > 0 ? { divider } : {}) };
  });
}

/** Grid quarters (`:273-295`): for each mark, its vertical then its horizontal line. */
function gridOf(frame: Frame): Segment[] {
  const { c, chartWidth, chartHeight } = frame;
  const p = c.padding;
  const lines: Segment[] = [];
  for (let i = 1; i < M.grid.divisions; i++) {
    const ratio = i / M.grid.divisions;
    const x = p + chartWidth * ratio;
    const y = c.height - p - chartHeight * ratio;
    lines.push({ from: { x, y: p }, to: { x, y: c.height - p } });
    lines.push({ from: { x: p, y }, to: { x: c.width - p, y } });
  }
  return lines;
}

/**
 * Pipelines (`:306-380`), in model order: dashed joins between the children by evolution, the
 * box `pad` past the outer children about the last child's line, and the parent moved to the
 * box's centre x, `lift · square` above its top. A later pipeline sees the moves of the earlier
 * ones (a child that is itself a parent).
 */
function pipelinesOf(model: WardleyModel, env: Env): WardleyPipelineLayout[] {
  const { positions, byId, c, square } = env;
  const out: WardleyPipelineLayout[] = [];
  for (const pipeline of model.pipelines) {
    const children = pipeline.componentIds
      .map((id) => ({ pos: positions.get(id), node: byId.get(id) }))
      .filter((k): k is { pos: Point; node: WardleyNode } => k.pos !== undefined && !!k.node);
    if (children.length === 0) continue;
    const sorted = [...children].sort((a, b) => a.node.x - b.node.x);
    const joins = sorted.slice(1).map((next, i) => ({ from: sorted[i]!.pos, to: next.pos }));
    const xs = children.map((k) => k.pos.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const height = c.nodeRadius * M.pipeline.heightFactor;
    const top = children[children.length - 1]!.pos.y - height / 2;
    if (positions.has(pipeline.nodeId))
      positions.set(pipeline.nodeId, { x: (minX + maxX) / 2, y: top - square * M.pipeline.lift });
    const pad = M.pipeline.pad;
    out.push({
      ast: pipeline.astId,
      nodeId: pipeline.nodeId,
      box: { x: minX - pad, y: top, width: maxX - minX + pad * 2, height },
      joins,
    });
  }
  return out;
}

/** Where a link meets a node: its circle, or the corner distance of a parent's square. */
function endRadius(node: WardleyNode, c: WardleyLayoutConfig, square: number): number {
  return node.isPipelineParent ? square / Math.SQRT2 : c.nodeRadius;
}

/**
 * v12's marker (`M 0 0 L 10 5 L 0 10 z`, `refX` 9 of 10) at `at`, pointing along the unit
 * vector `dir`, `size` long and wide: the two base corners and the tip.
 */
function head(at: Point, dir: Point, size: number): Triangle {
  const tip = { x: at.x + dir.x * M.head.tip * size, y: at.y + dir.y * M.head.tip * size };
  const base = { x: at.x - dir.x * M.head.base * size, y: at.y - dir.y * M.head.base * size };
  const half = size / 2;
  const n = { x: -dir.y * half, y: dir.x * half };
  return [{ x: base.x + n.x, y: base.y + n.y }, tip, { x: base.x - n.x, y: base.y - n.y }];
}

/**
 * Links (`:382-530`): only between drawn nodes, never a child to its own parent, never a
 * self-link or between coincident nodes; shortened by each end's radius; heads by flow; the
 * label `labelOffset` off the midpoint of the centres, rotated with the line, flipped past ±90°.
 */
function linksOf(model: WardleyModel, env: Env): WardleyLinkLayout[] {
  const { positions, byId, c, square, fonts, place } = env;
  const children = new Map(model.pipelines.map((p) => [p.nodeId, new Set(p.componentIds)]));
  const out: WardleyLinkLayout[] = [];
  for (const link of model.links) {
    const s = positions.get(link.source);
    const t = positions.get(link.target);
    if (!s || !t || link.source === link.target) continue;
    if (children.get(link.target)?.has(link.source)) continue;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const d = Math.hypot(dx, dy);
    if (d === 0) continue;
    const u = { x: dx / d, y: dy / d };
    const rs = endRadius(byId.get(link.source)!, c, square);
    const rt = endRadius(byId.get(link.target)!, c, square);
    const from = { x: s.x + u.x * rs, y: s.y + u.y * rs };
    const to = { x: t.x - u.x * rt, y: t.y - u.y * rt };
    const forward = link.flow === 'forward' || link.flow === 'bidirectional';
    const backward = link.flow === 'backward' || link.flow === 'bidirectional';
    const heads = {
      ...(backward ? { start: head(from, { x: -u.x, y: -u.y }, M.head.link) } : {}),
      ...(forward ? { end: head(to, u, M.head.link) } : {}),
    };
    let label: PlacedText | undefined;
    if (link.label) {
      const off = M.link.labelOffset;
      const at = { x: (s.x + t.x) / 2 + u.y * off, y: (s.y + t.y) / 2 - u.x * off };
      let angle = (Math.atan2(dy, dx) * HALF_TURN) / Math.PI;
      if (angle > M.link.flipAngle || angle < -M.link.flipAngle) angle += HALF_TURN;
      label = place(link.label, fonts.link, at, 'middle', 'middle', angle);
    }
    out.push({
      ast: link.astId,
      source: link.source,
      target: link.target,
      from,
      to,
      dashed: link.dashed,
      ...(link.flow ? { flow: link.flow } : {}),
      heads,
      ...(label ? { label } : {}),
    });
  }
  return out;
}

/**
 * Trends (`:532-582`): from the node's point (a parent's moved one) to its target, shortened by
 * `nodeRadius + gap` when longer. A trend to its own point points right (no direction; never NaN).
 */
function trendsOf(
  model: WardleyModel,
  positions: ReadonlyMap<string, Point>,
  frame: Frame
): WardleyTrendLayout[] {
  const shorten = frame.c.nodeRadius + M.trend.gap;
  const out: WardleyTrendLayout[] = [];
  for (const trend of model.trends) {
    const from = positions.get(trend.nodeId);
    if (!from) continue;
    const target = { x: frame.x(trend.targetX), y: frame.y(trend.targetY) };
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const d = Math.hypot(dx, dy);
    const u = d > 0 ? { x: dx / d, y: dy / d } : { x: 1, y: 0 };
    const to = d > shorten ? { x: target.x - u.x * shorten, y: target.y - u.y * shorten } : target;
    out.push({
      ast: trend.astId,
      nodeId: trend.nodeId,
      from,
      to,
      head: head(to, u, M.head.trend),
    });
  }
  return out;
}

/** A node (`:584-823`): glyph, strategy overlay, market dots, inertia bar and label. */
function nodeOf(node: WardleyNode, point: Point, env: Env): WardleyNodeLayout {
  const { c, square, fonts, place } = env;
  const r = c.nodeRadius;
  const parent = node.isPipelineParent;
  const strategy = node.sourceStrategy;
  const anchor = node.className === 'anchor';
  let glyph: WardleyNodeLayout['glyph'] = 'circle';
  if (parent) glyph = 'square';
  else if (strategy === 'market' || anchor) glyph = 'none';
  let radius = 0;
  if (glyph === 'square') radius = square / 2;
  else if (glyph === 'circle') radius = r;

  const out: { -readonly [K in keyof WardleyNodeLayout]: WardleyNodeLayout[K] } = {
    id: node.id,
    ast: node.astId,
    className: node.className,
    point,
    glyph,
    radius,
    label: labelOf(node, point, c, fonts, place),
  };
  if (strategy) out.overlay = { strategy, radius: r * M.node.overlayFactor };
  if (strategy === 'market') {
    const spread = r * M.node.spreadFactor;
    const dx = spread * Math.cos(M.node.spreadAngle);
    const dy = spread * Math.sin(M.node.spreadAngle);
    out.market = {
      dots: [
        { x: point.x, y: point.y - spread },
        { x: point.x - dx, y: point.y + dy },
        { x: point.x + dx, y: point.y + dy },
      ],
      radius: r * M.node.dotFactor,
    };
  }
  if (node.inertia) {
    const half = parent ? square / 2 : r;
    let offset = half + M.node.inertiaGap;
    if (strategy) offset += r + M.node.inertiaStrategyGap;
    const x = point.x + offset;
    out.inertia = {
      line: { from: { x, y: point.y - half }, to: { x, y: point.y + half } },
      width: M.node.inertiaWidth,
    };
  }
  return out;
}

/**
 * A node's label (`:779-823`): an anchor's centred and bold, `anchorLift` up; any other node's
 * `nodeLabelOffset` up and right (`strategyShift` further with a strategy), unless it sets its own.
 */
function labelOf(
  node: WardleyNode,
  point: Point,
  c: WardleyLayoutConfig,
  fonts: Fonts,
  place: Place
): PlacedText {
  const { labelOffsetX: ox, labelOffsetY: oy } = node;
  if (node.className === 'anchor') {
    const at = { x: point.x + (ox ?? 0), y: point.y + (oy ?? -M.node.anchorLift) };
    return place(node.label, fonts.anchor, at, 'middle', 'middle');
  }
  const shift = node.sourceStrategy ? M.node.strategyShift : 0;
  const at = {
    x: point.x + (ox ?? c.nodeLabelOffset + shift),
    y: point.y + (oy ?? -(c.nodeLabelOffset + shift)),
  };
  return place(node.label, fonts.node, at, 'start', 'auto');
}

/**
 * The annotations box (`:880-955`), only with `annotations` and an annotation with text: a line
 * per such annotation by number, the box sized from the widest and tallest, clamped to the chart.
 */
function annotationsBoxOf(
  model: WardleyModel,
  frame: Frame,
  fonts: Fonts,
  place: Place
): WardleyAnnotationsBoxLayout | undefined {
  const at = model.annotationsBox;
  if (!at || model.annotations.length === 0) return undefined;
  const texts = model.annotations.filter((a) => a.text).sort((a, b) => a.number - b.number);
  if (texts.length === 0) return undefined;
  const A = M.annotation;
  const { c } = frame;
  const measured = texts.map((a) =>
    place(`${a.number}. ${a.text}`, fonts.annotation, { x: 0, y: 0 }, 'start', 'middle')
  );
  const width = Math.max(...measured.map((t) => t.width)) + A.padding * 2 + A.extraWidth;
  const tallest = Math.max(...measured.map((t) => t.height));
  const height = texts.length * A.lineHeight + A.padding * 2 + tallest / 2;
  const x = Math.max(c.padding, Math.min(frame.x(at.x), c.width - c.padding - width));
  const y = Math.max(c.padding, Math.min(frame.y(at.y), c.height - c.padding - height));
  const lines = texts.map((a, i) =>
    place(
      `${a.number}. ${a.text}`,
      fonts.annotation,
      { x: x + A.padding, y: y + A.padding + (i + 1) * A.lineHeight },
      'start',
      'middle'
    )
  );
  return { ast: at.astId, box: { x, y, width, height }, lines };
}

/** An accelerator pointing right, or a deaccelerator pointing left (`:978-1066`). */
function acceleratorOf(
  a: WardleyAccelerator,
  left: boolean,
  frame: Frame,
  fonts: Fonts,
  place: Place
): WardleyAcceleratorLayout {
  const { width: w, height: h, head: hw, flare } = M.accelerator;
  const x = frame.x(a.x);
  const y = frame.y(a.y);
  const top = y - h / 2;
  const bottom = y + h / 2;
  const shaftEnd = left ? x + hw : x + w - hw;
  const tail = left ? x + w : x;
  const tip = left ? x : x + w;
  const outline = [
    { x: tail, y: top },
    { x: shaftEnd, y: top },
    { x: shaftEnd, y: top - flare },
    { x: tip, y },
    { x: shaftEnd, y: bottom + flare },
    { x: shaftEnd, y: bottom },
    { x: tail, y: bottom },
  ];
  const label = place(
    a.name,
    fonts.accelerator,
    { x: x + w / 2, y: bottom + M.accelerator.labelGap },
    'middle',
    'auto'
  );
  return { ast: a.astId, name: a.name, outline, label };
}

/** What a node draws, stroke half-widths included. */
function addNode(box: Box, n: WardleyNodeLayout): void {
  const stroke = M.node.stroke / 2;
  if (n.glyph !== 'none') box.disc(n.point, n.radius + stroke);
  if (n.overlay) box.disc(n.point, n.overlay.radius + stroke);
  if (n.market)
    for (const dot of n.market.dots) box.disc(dot, n.market.radius + M.node.dotStroke / 2);
  if (n.inertia) box.line(n.inertia.line.from, n.inertia.line.to, n.inertia.width);
  box.text(n.label);
}

/** v12's canvas grown over everything drawn, stroke half-widths included (D224). */
function boundsOf(l: Omit<WardleyLayout, 'bounds'>): WardleyLayout['bounds'] {
  const box = new Box();
  box.add({ x: 0, y: 0, width: l.width, height: l.height });
  const line = (s: Segment, width: number): void => box.line(s.from, s.to, width);
  if (l.title) box.text(l.title);
  line(l.axes.x, M.axis.stroke);
  line(l.axes.y, M.axis.stroke);
  box.text(l.axes.xLabel);
  box.text(l.axes.yLabel);
  for (const s of l.stages) {
    box.text(s.label);
    if (s.divider) line(s.divider, M.stage.stroke);
  }
  for (const g of l.grid) line(g, M.grid.stroke);
  for (const p of l.pipelines) {
    box.framed(p.box, M.pipeline.stroke);
    for (const j of p.joins) line(j, M.pipeline.joinStroke);
  }
  for (const k of l.links) {
    box.line(k.from, k.to, M.link.stroke);
    for (const h of [k.heads.start, k.heads.end]) if (h) for (const pt of h) box.point(pt);
    if (k.label) box.text(k.label);
  }
  for (const t of l.trends) {
    box.line(t.from, t.to, M.trend.stroke);
    for (const pt of t.head) box.point(pt);
  }
  for (const n of l.nodes) addNode(box, n);
  for (const a of l.annotations) {
    box.disc(a.point, a.radius + M.annotation.stroke / 2);
    box.text(a.label);
  }
  if (l.annotationsBox) {
    box.framed(l.annotationsBox.box, M.annotation.boxStroke);
    for (const t of l.annotationsBox.lines) box.text(t);
  }
  for (const n of l.notes) box.text(n.label);
  for (const a of [...l.accelerators, ...l.deaccelerators]) {
    for (const pt of a.outline) box.disc(pt, M.accelerator.stroke / 2);
    box.text(a.label);
  }
  return box.rect();
}
