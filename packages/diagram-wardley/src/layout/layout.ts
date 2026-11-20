/**
 * The wardley custom layout (spec #430 T3, `layoutKind: 'custom'`): `WardleyModel` in,
 * `WardleyLayout` out. It follows v12's `wardleyRenderer.ts` with the drawing taken out (line
 * numbers are `git show fa796a943:packages/mermaid/src/diagrams/wardley/wardleyRenderer.ts`'s):
 * the canvas and the projection, the stages and the grid, then the pipelines, which move their
 * parents (in model order) and hand the moved positions to the links, the trends and the nodes,
 * then the annotations, the notes and the (de)accelerators. Every text is one literal line, as
 * v12's `.text()` drew it, measured through the injected measurer in the theme's font family
 * (D422, pitfall 16) and placed where v12's `text-anchor` and `dominant-baseline` put it; the
 * bounds grow past v12's canvas wherever something drawn reaches out of it (D224). Lengths come
 * from the `wardley-beta` config, the map's `size` and the metrics table (pitfall 13).
 *
 * Never NaN or nothing (D424, D226): the config falls back where v12 drew nothing
 * (`WARDLEY_CONFIG_INVALID`), custom stage boundaries are clamped to [0, 1]
 * (`WARDLEY_STAGE_CLAMPED`), and links are dropped where v12 wrote NaN: a self-link or a link
 * to an unknown name (the parser warns, D425) and a link whose ends coincide (in the parser's
 * `WARDLEY_LINK_DROPPED` when it can tell from the model, else raised here). A link from a
 * pipeline child to its own parent is skipped without a warning, as v12's renderer did
 * (`:390-403`).
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey, Measurer } from '@mermaid-js/core/text';
import { wardleyLayoutConfig, wardleySection, type WardleyLayoutConfig } from '../config.ts';
import { WARDLEY_LINK_DROPPED, WARDLEY_STAGE_CLAMPED } from '../codes.ts';
import type { WardleyAccelerator, WardleyModel, WardleyNode } from '../model.ts';
import { Box, HALF_TURN } from './geometry.ts';
import {
  AXIS_LABELS,
  BOLD_WEIGHT,
  DEFAULT_STAGES,
  NORMAL_WEIGHT,
  WARDLEY_METRICS as metrics,
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

/** For a layout run without a `warn` sink (unit tests, the invariants). */
const ignoreWarning = (): void => undefined;

type Fonts = WardleyLayout['fonts'];
type Warn = (w: Warning) => void;
type Positions = ReadonlyMap<string, Point>;

/** One text to measure and place. */
interface TextParts {
  readonly text: string;
  readonly font: FontKey;
  readonly at: Point;
  readonly anchor: WardleyTextAnchor;
  readonly baseline: WardleyBaseline;
  /** Degrees clockwise about `at`; 0 when absent. */
  readonly rotate?: number;
}

/** The fonts and the measurer: what every step that writes text needs. */
interface Typesetter {
  readonly fonts: Fonts;
  place(parts: TextParts): PlacedText;
}

/** The chart's frame: v12's `projectX` and `projectY` (`:165-166`). */
interface Frame {
  readonly config: WardleyLayoutConfig;
  readonly chartWidth: number;
  readonly chartHeight: number;
  /** Evolution 0–100 to x. */
  x(evolution: number): number;
  /** Visibility 0–100 to y. */
  y(visibility: number): number;
}

/** What the pipeline, link and node steps share. */
interface Env {
  readonly config: WardleyLayoutConfig;
  /** A pipeline parent's square: `squareFactor · nodeRadius`. */
  readonly square: number;
  readonly type: Typesetter;
  readonly byId: ReadonlyMap<string, WardleyNode>;
}

/** Lays out a Wardley map in px. */
export function layoutWardley(model: WardleyModel, ctx: WardleyLayoutContext): WardleyLayout {
  const warn = ctx.warn ?? ignoreWarning;
  const config = wardleyLayoutConfig(wardleySection(ctx.config), model.size, warn);
  const { width, height, padding } = config;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const frame: Frame = {
    config,
    chartWidth,
    chartHeight,
    x: (v) => padding + (v / 100) * chartWidth,
    y: (v) => height - padding - (v / 100) * chartHeight,
  };
  const type = typesetter(ctx.measurer, fontsOf(config, ctx.theme.value('fontFamily')));
  const { fonts } = type;

  const title = model.title
    ? type.place({
        text: model.title,
        font: fonts.title,
        at: { x: width / 2, y: padding * metrics.title.yFactor },
        anchor: 'middle',
        baseline: 'middle',
      })
    : undefined;
  const axes = {
    x: {
      from: { x: padding, y: height - padding },
      to: { x: width - padding, y: height - padding },
    },
    y: { from: { x: padding, y: padding }, to: { x: padding, y: height - padding } },
    xLabel: type.place({
      text: AXIS_LABELS.x,
      font: fonts.axis,
      at: { x: padding + chartWidth / 2, y: height - padding * metrics.axis.xLabelFactor },
      anchor: 'middle',
      baseline: 'auto',
    }),
    yLabel: type.place({
      text: AXIS_LABELS.y,
      font: fonts.axis,
      at: { x: padding * metrics.axis.yLabelFactor, y: padding + chartHeight / 2 },
      anchor: 'middle',
      baseline: 'auto',
      rotate: metrics.axis.yLabelRotate,
    }),
  };
  const stages = stagesOf({ model, frame, type, warn });
  const grid = config.showGrid ? gridOf(frame) : [];

  // Positions (`:297-304`); the pipelines move their parents, then the rest read them.
  const env: Env = {
    config,
    square: config.nodeRadius * metrics.pipeline.squareFactor,
    type,
    byId: new Map(model.nodes.map((n) => [n.id, n])),
  };
  const projected = new Map(model.nodes.map((n) => [n.id, { x: frame.x(n.x), y: frame.y(n.y) }]));
  const { pipelines, positions } = pipelinesOf(model, projected, env);
  const links = linksOf(model, positions, env, warn);
  const trends = trendsOf(model, positions, frame);
  const nodes = model.nodes.map((node) => nodeOf(node, positions.get(node.id)!, env));

  const annotations = model.annotations.map((a) => {
    const point = { x: frame.x(a.x), y: frame.y(a.y) };
    return {
      ast: a.astId,
      number: a.number,
      point,
      radius: metrics.annotation.radius,
      label: type.place({
        text: String(a.number),
        font: fonts.annotationNumber,
        at: point,
        anchor: 'middle',
        baseline: 'central',
      }),
    };
  });
  const annotationsBox = annotationsBoxOf(model, frame, type);
  const notes = model.notes.map((n) => ({
    ast: n.astId,
    label: type.place({
      text: n.text,
      font: fonts.note,
      at: { x: frame.x(n.x), y: frame.y(n.y) },
      anchor: 'start',
      baseline: 'auto',
    }),
  }));
  const arrows = (list: readonly WardleyAccelerator[], direction: Direction) =>
    list.map((accelerator) => acceleratorOf({ accelerator, direction, frame, type }));

  const layout: Omit<WardleyLayout, 'bounds'> = {
    width,
    height,
    padding,
    nodeRadius: config.nodeRadius,
    chart: { x: padding, y: padding, width: chartWidth, height: chartHeight },
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
    accelerators: arrows(model.accelerators, 'right'),
    deaccelerators: arrows(model.deaccelerators, 'left'),
    fonts,
  };
  return { ...layout, bounds: boundsOf(layout) };
}

/** The fonts (D422: the theme's family; v12's sizes and weights). */
function fontsOf(config: WardleyLayoutConfig, family: string): Fonts {
  const font = (size: number, weight = NORMAL_WEIGHT): FontKey => ({
    family,
    size: Math.max(0, size),
    weight,
  });
  return {
    title: font(config.axisFontSize * metrics.title.fontScale, BOLD_WEIGHT),
    axis: font(config.axisFontSize, BOLD_WEIGHT),
    stage: font(config.axisFontSize - metrics.stage.fontDelta),
    node: font(config.labelFontSize),
    anchor: font(config.labelFontSize, BOLD_WEIGHT),
    link: font(config.labelFontSize),
    annotationNumber: font(metrics.annotation.numberFontSize, BOLD_WEIGHT),
    annotation: font(metrics.annotation.fontSize),
    note: font(metrics.note.fontSize, BOLD_WEIGHT),
    accelerator: font(metrics.accelerator.fontSize, BOLD_WEIGHT),
  };
}

/** How far left of its anchor a text's box starts, in text widths. */
const ANCHOR_SHIFT: Readonly<Record<WardleyTextAnchor, number>> = { start: 0, middle: 1 / 2 };

/** XML white space, which a text node draws as one space (and not at its ends). */
const RE_WHITE_SPACE = /[ \t\n\r]+/g;

/**
 * Texts as v12's `.text()` drew them: one literal line (no markup, entity or line break), its
 * white space collapsed as SVG draws it, measured in its font and boxed on `at` as v12's
 * `text-anchor` and `dominant-baseline` place it.
 */
function typesetter(measurer: Measurer, fonts: Fonts): Typesetter {
  return {
    fonts,
    place({ text, font, at, anchor, baseline, rotate = 0 }) {
      const drawn = text.replace(RE_WHITE_SPACE, ' ').trim();
      const width = drawn === '' ? 0 : measurer.width(drawn, font, 0);
      const { ascent, lineHeight } = measurer.metrics(font);
      return {
        x: at.x - ANCHOR_SHIFT[anchor] * width,
        y: baseline === 'auto' ? at.y - ascent : at.y - lineHeight / 2,
        width,
        height: lineHeight,
        text: drawn,
        font,
        ascent,
        at,
        anchor,
        baseline,
        rotate,
      };
    },
  };
}

/** `text` moved by `(dx, dy)`. */
function shifted(text: PlacedText, dx: number, dy: number): PlacedText {
  return {
    ...text,
    x: text.x + dx,
    y: text.y + dy,
    at: { x: text.at.x + dx, y: text.at.y + dy },
  };
}

/** What the stages are laid out from. */
interface StageParts {
  readonly model: WardleyModel;
  readonly frame: Frame;
  readonly type: Typesetter;
  readonly warn: Warn;
}

/**
 * The stages (`:214-271`): the author's or v12's four; custom widths only when every stage has
 * a boundary, each clamped to [0, 1] (D424, one warning), in the author's order (decreasing
 * boundaries draw backwards, as in v12); else equal widths.
 */
function stagesOf({ model, frame, type, warn }: StageParts): WardleyStageLayout[] {
  const { config, chartWidth } = frame;
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
  const { padding, height } = config;
  const labelY = height - padding / metrics.stage.labelDivisor;
  return names.map((name, i) => {
    const [from, to] = spans[i]!;
    const start = padding + from * chartWidth;
    const end = padding + to * chartWidth;
    const label = type.place({
      text: name,
      font: type.fonts.stage,
      at: { x: (start + end) / 2, y: labelY },
      anchor: 'middle',
      baseline: 'auto',
    });
    const divider = { from: { x: start, y: padding }, to: { x: start, y: height - padding } };
    return { start, end, label, ...(i > 0 ? { divider } : {}) };
  });
}

/** Grid quarters (`:273-295`): for each mark, its vertical then its horizontal line. */
function gridOf(frame: Frame): Segment[] {
  const { config, chartWidth, chartHeight } = frame;
  const { padding, width, height } = config;
  const lines: Segment[] = [];
  for (let i = 1; i < metrics.grid.divisions; i++) {
    const ratio = i / metrics.grid.divisions;
    const x = padding + chartWidth * ratio;
    const y = height - padding - chartHeight * ratio;
    lines.push({ from: { x, y: padding }, to: { x, y: height - padding } });
    lines.push({ from: { x: padding, y }, to: { x: width - padding, y } });
  }
  return lines;
}

/**
 * Pipelines (`:306-380`), in model order: dashed joins between the children by evolution, the
 * box `pad` past the outer children about the last child's line, and the parent moved to the
 * box's centre x, `lift · square` above its top. A later pipeline sees the moves of the earlier
 * ones (a child that is itself a parent). Returns the boxes and every node's final position.
 */
function pipelinesOf(
  model: WardleyModel,
  projected: Positions,
  env: Env
): { pipelines: WardleyPipelineLayout[]; positions: Positions } {
  const { byId, config, square } = env;
  const positions = new Map(projected);
  const pipelines: WardleyPipelineLayout[] = [];
  for (const pipeline of model.pipelines) {
    const children = pipeline.componentIds
      .map((id) => ({ pos: positions.get(id), node: byId.get(id) }))
      .filter(
        (child): child is { pos: Point; node: WardleyNode } =>
          child.pos !== undefined && !!child.node
      );
    if (children.length === 0) continue;
    const sorted = [...children].sort((a, b) => a.node.x - b.node.x);
    const joins = sorted.slice(1).map((next, i) => ({ from: sorted[i]!.pos, to: next.pos }));
    const xs = children.map((child) => child.pos.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const boxHeight = config.nodeRadius * metrics.pipeline.heightFactor;
    const top = children[children.length - 1]!.pos.y - boxHeight / 2;
    if (positions.has(pipeline.nodeId))
      positions.set(pipeline.nodeId, {
        x: (minX + maxX) / 2,
        y: top - square * metrics.pipeline.lift,
      });
    const pad = metrics.pipeline.pad;
    pipelines.push({
      ast: pipeline.astId,
      nodeId: pipeline.nodeId,
      box: { x: minX - pad, y: top, width: maxX - minX + pad * 2, height: boxHeight },
      joins,
    });
  }
  return { pipelines, positions };
}

/** Where a link meets a node: its circle, or the corner distance of a parent's square. */
function endRadius(node: WardleyNode, env: Env): number {
  return node.isPipelineParent ? env.square / Math.SQRT2 : env.config.nodeRadius;
}

/**
 * v12's marker (`M 0 0 L 10 5 L 0 10 z`, `refX` 9 of 10) at `at`, pointing along the unit
 * vector `dir`, `size` long and wide: the two base corners and the tip.
 */
function head(at: Point, dir: Point, size: number): Triangle {
  const { tip: tipShare, base: baseShare } = metrics.head;
  const tip = { x: at.x + dir.x * tipShare * size, y: at.y + dir.y * tipShare * size };
  const base = { x: at.x - dir.x * baseShare * size, y: at.y - dir.y * baseShare * size };
  const half = size / 2;
  const normal = { x: -dir.y * half, y: dir.x * half };
  return [
    { x: base.x + normal.x, y: base.y + normal.y },
    tip,
    { x: base.x - normal.x, y: base.y - normal.y },
  ];
}

/**
 * Links (`:382-530`): only between drawn nodes, never a child to its own parent, a self-link or
 * between coincident nodes; shortened by each end's radius; heads by flow; the label
 * `labelOffset` off the midpoint of the centres, rotated with the line, flipped past ±90°.
 */
function linksOf(
  model: WardleyModel,
  positions: Positions,
  env: Env,
  warn: Warn
): WardleyLinkLayout[] {
  const children = new Map(model.pipelines.map((p) => [p.nodeId, new Set(p.componentIds)]));
  const coincident: AstId[] = [];
  const out: WardleyLinkLayout[] = [];
  for (const link of model.links) {
    const source = positions.get(link.source);
    const target = positions.get(link.target);
    if (!source || !target || link.source === link.target) continue;
    if (children.get(link.target)?.has(link.source)) continue;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      coincident.push(link.astId);
      continue;
    }
    const u = { x: dx / length, y: dy / length };
    const fromRadius = endRadius(env.byId.get(link.source)!, env);
    const toRadius = endRadius(env.byId.get(link.target)!, env);
    const from = { x: source.x + u.x * fromRadius, y: source.y + u.y * fromRadius };
    const to = { x: target.x - u.x * toRadius, y: target.y - u.y * toRadius };
    const forward = link.flow === 'forward' || link.flow === 'bidirectional';
    const backward = link.flow === 'backward' || link.flow === 'bidirectional';
    const heads = {
      ...(backward ? { start: head(from, { x: -u.x, y: -u.y }, metrics.head.link) } : {}),
      ...(forward ? { end: head(to, u, metrics.head.link) } : {}),
    };
    let label: PlacedText | undefined;
    if (link.label) {
      const off = metrics.link.labelOffset;
      const at = {
        x: (source.x + target.x) / 2 + u.y * off,
        y: (source.y + target.y) / 2 - u.x * off,
      };
      let rotate = (Math.atan2(dy, dx) * HALF_TURN) / Math.PI;
      if (rotate > metrics.link.flipAngle || rotate < -metrics.link.flipAngle) rotate += HALF_TURN;
      label = env.type.place({
        text: link.label,
        font: env.type.fonts.link,
        at,
        anchor: 'middle',
        baseline: 'middle',
        rotate,
      });
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
  // D425, one warning per kind: the parser's names the links it could tell from the model.
  if (coincident.length > 0 && !model.warnings.some((w) => w.code === WARDLEY_LINK_DROPPED))
    warn({
      code: WARDLEY_LINK_DROPPED,
      message: `${coincident.length === 1 ? 'A link is' : `${coincident.length} links are`} not drawn: its ends are at the same place.`,
      astIds: coincident,
    });
  return out;
}

/**
 * Trends (`:532-582`): from the node's point (a parent's moved one) to its target, shortened by
 * `nodeRadius + gap` when longer. A trend to its own point points right (no direction; never NaN).
 */
function trendsOf(model: WardleyModel, positions: Positions, frame: Frame): WardleyTrendLayout[] {
  const shorten = frame.config.nodeRadius + metrics.trend.gap;
  const out: WardleyTrendLayout[] = [];
  for (const trend of model.trends) {
    const from = positions.get(trend.nodeId);
    if (!from) continue;
    const target = { x: frame.x(trend.targetX), y: frame.y(trend.targetY) };
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const length = Math.hypot(dx, dy);
    const u = length > 0 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
    const to =
      length > shorten ? { x: target.x - u.x * shorten, y: target.y - u.y * shorten } : target;
    out.push({
      ast: trend.astId,
      nodeId: trend.nodeId,
      from,
      to,
      head: head(to, u, metrics.head.trend),
    });
  }
  return out;
}

/** A node (`:584-823`): glyph, strategy overlay, market dots, inertia bar and label. */
function nodeOf(node: WardleyNode, point: Point, env: Env): WardleyNodeLayout {
  const { config, square } = env;
  const radius = config.nodeRadius;
  const parent = node.isPipelineParent;
  const strategy = node.sourceStrategy;
  let glyph: WardleyNodeLayout['glyph'] = 'circle';
  if (parent) glyph = 'square';
  else if (strategy === 'market' || node.className === 'anchor') glyph = 'none';
  let glyphRadius = 0;
  if (glyph === 'square') glyphRadius = square / 2;
  else if (glyph === 'circle') glyphRadius = radius;

  const out: { -readonly [K in keyof WardleyNodeLayout]: WardleyNodeLayout[K] } = {
    id: node.id,
    ast: node.astId,
    className: node.className,
    point,
    glyph,
    radius: glyphRadius,
    label: labelOf({ node, point, config, type: env.type }),
  };
  const shape = metrics.node;
  if (strategy) out.overlay = { strategy, radius: radius * shape.overlayFactor };
  if (strategy === 'market') {
    const spread = radius * shape.spreadFactor;
    const dx = spread * Math.cos(shape.spreadAngle);
    const dy = spread * Math.sin(shape.spreadAngle);
    out.market = {
      dots: [
        { x: point.x, y: point.y - spread },
        { x: point.x - dx, y: point.y + dy },
        { x: point.x + dx, y: point.y + dy },
      ],
      radius: radius * shape.dotFactor,
    };
  }
  if (node.inertia) {
    const half = parent ? square / 2 : radius;
    let offset = half + shape.inertiaGap;
    if (strategy) offset += radius + shape.inertiaStrategyGap;
    const x = point.x + offset;
    out.inertia = {
      line: { from: { x, y: point.y - half }, to: { x, y: point.y + half } },
      width: shape.inertiaWidth,
    };
  }
  return out;
}

/** What a node's label is placed from. */
interface LabelParts {
  readonly node: WardleyNode;
  readonly point: Point;
  readonly config: WardleyLayoutConfig;
  readonly type: Typesetter;
}

/**
 * A node's label (`:779-823`): an anchor's centred and bold, `anchorLift` up; any other node's
 * `nodeLabelOffset` up and right (`strategyShift` further with a strategy), unless it sets its own.
 */
function labelOf({ node, point, config, type }: LabelParts): PlacedText {
  const { labelOffsetX: ox, labelOffsetY: oy } = node;
  if (node.className === 'anchor') {
    const at = { x: point.x + (ox ?? 0), y: point.y + (oy ?? -metrics.node.anchorLift) };
    return type.place({
      text: node.label,
      font: type.fonts.anchor,
      at,
      anchor: 'middle',
      baseline: 'middle',
    });
  }
  const shift = node.sourceStrategy ? metrics.node.strategyShift : 0;
  const at = {
    x: point.x + (ox ?? config.nodeLabelOffset + shift),
    y: point.y + (oy ?? -(config.nodeLabelOffset + shift)),
  };
  return type.place({
    text: node.label,
    font: type.fonts.node,
    at,
    anchor: 'start',
    baseline: 'auto',
  });
}

/**
 * The annotations box (`:880-955`), only with `annotations` and an annotation with text: a line
 * per such annotation by number, the box sized from the widest and tallest, clamped to the chart.
 */
function annotationsBoxOf(
  model: WardleyModel,
  frame: Frame,
  type: Typesetter
): WardleyAnnotationsBoxLayout | undefined {
  const at = model.annotationsBox;
  if (!at || model.annotations.length === 0) return undefined;
  const texts = model.annotations.filter((a) => a.text).sort((a, b) => a.number - b.number);
  if (texts.length === 0) return undefined;
  const box = metrics.annotation;
  const { config } = frame;
  // Measured once at the origin, moved into the box once it is placed.
  const measured = texts.map((a) =>
    type.place({
      text: `${a.number}. ${a.text}`,
      font: type.fonts.annotation,
      at: { x: 0, y: 0 },
      anchor: 'start',
      baseline: 'middle',
    })
  );
  const width = Math.max(...measured.map((t) => t.width)) + box.padding * 2 + box.extraWidth;
  const tallest = Math.max(...measured.map((t) => t.height));
  const height = texts.length * box.lineHeight + box.padding * 2 + tallest / 2;
  const x = Math.max(
    config.padding,
    Math.min(frame.x(at.x), config.width - config.padding - width)
  );
  const y = Math.max(
    config.padding,
    Math.min(frame.y(at.y), config.height - config.padding - height)
  );
  const lines = measured.map((t, i) =>
    shifted(t, x + box.padding, y + box.padding + (i + 1) * box.lineHeight)
  );
  return { ast: at.astId, box: { x, y, width, height }, lines };
}

/** Which way a (de)accelerator points. */
type Direction = 'right' | 'left';

/** What a (de)accelerator is drawn from. */
interface AcceleratorParts {
  readonly accelerator: WardleyAccelerator;
  readonly direction: Direction;
  readonly frame: Frame;
  readonly type: Typesetter;
}

/** An accelerator pointing right, or a deaccelerator pointing left (`:978-1066`). */
function acceleratorOf({
  accelerator,
  direction,
  frame,
  type,
}: AcceleratorParts): WardleyAcceleratorLayout {
  const { width, height, head: headWidth, flare, labelGap } = metrics.accelerator;
  const x = frame.x(accelerator.x);
  const y = frame.y(accelerator.y);
  const top = y - height / 2;
  const bottom = y + height / 2;
  const left = direction === 'left';
  const shaftEnd = left ? x + headWidth : x + width - headWidth;
  const tail = left ? x + width : x;
  const tip = left ? x : x + width;
  const outline = [
    { x: tail, y: top },
    { x: shaftEnd, y: top },
    { x: shaftEnd, y: top - flare },
    { x: tip, y },
    { x: shaftEnd, y: bottom + flare },
    { x: shaftEnd, y: bottom },
    { x: tail, y: bottom },
  ];
  const label = type.place({
    text: accelerator.name,
    font: type.fonts.accelerator,
    at: { x: x + width / 2, y: bottom + labelGap },
    anchor: 'middle',
    baseline: 'auto',
  });
  return { ast: accelerator.astId, name: accelerator.name, outline, label };
}

/** What a node draws, stroke half-widths included. */
function addNode(box: Box, node: WardleyNodeLayout): void {
  const stroke = metrics.node.stroke / 2;
  if (node.glyph !== 'none') box.disc(node.point, node.radius + stroke);
  if (node.overlay) box.disc(node.point, node.overlay.radius + stroke);
  if (node.market)
    for (const dot of node.market.dots)
      box.disc(dot, node.market.radius + metrics.node.dotStroke / 2);
  if (node.inertia) box.line(node.inertia.line.from, node.inertia.line.to, node.inertia.width);
  box.text(node.label);
}

/** v12's canvas grown over everything drawn, stroke half-widths included (D224). */
function boundsOf(layout: Omit<WardleyLayout, 'bounds'>): WardleyLayout['bounds'] {
  const box = new Box();
  box.add({ x: 0, y: 0, width: layout.width, height: layout.height });
  const line = (s: Segment, width: number): void => box.line(s.from, s.to, width);
  if (layout.title) box.text(layout.title);
  line(layout.axes.x, metrics.axis.stroke);
  line(layout.axes.y, metrics.axis.stroke);
  box.text(layout.axes.xLabel);
  box.text(layout.axes.yLabel);
  for (const stage of layout.stages) {
    box.text(stage.label);
    if (stage.divider) line(stage.divider, metrics.stage.stroke);
  }
  for (const g of layout.grid) line(g, metrics.grid.stroke);
  for (const pipeline of layout.pipelines) {
    box.framed(pipeline.box, metrics.pipeline.stroke);
    for (const j of pipeline.joins) line(j, metrics.pipeline.joinStroke);
  }
  for (const link of layout.links) {
    box.line(link.from, link.to, metrics.link.stroke);
    for (const h of [link.heads.start, link.heads.end]) if (h) for (const pt of h) box.point(pt);
    if (link.label) box.text(link.label);
  }
  for (const trend of layout.trends) {
    box.line(trend.from, trend.to, metrics.trend.stroke);
    for (const pt of trend.head) box.point(pt);
  }
  for (const node of layout.nodes) addNode(box, node);
  for (const a of layout.annotations) {
    box.disc(a.point, a.radius + metrics.annotation.stroke / 2);
    box.text(a.label);
  }
  if (layout.annotationsBox) {
    box.framed(layout.annotationsBox.box, metrics.annotation.boxStroke);
    for (const t of layout.annotationsBox.lines) box.text(t);
  }
  for (const n of layout.notes) box.text(n.label);
  for (const a of [...layout.accelerators, ...layout.deaccelerators]) {
    for (const pt of a.outline) box.disc(pt, metrics.accelerator.stroke / 2);
    box.text(a.label);
  }
  return box.rect();
}
