/**
 * MindmapModel → LayoutGraph (DESIGN §6.1, spec #294 T3): measures every label with core's
 * label layout (D225; modes as in v12, D562) in the font it is drawn in, sizes each shape with v12's
 * formulas (D287), reserves the `::icon()` slot (D297), and joins each node to its parent.
 * Every length comes from the metrics table through the render's unit profile (pitfall 13).
 */
import type { LayoutEdge, LayoutGraph, LayoutNode } from '@mermaid-js/core/layout';
import { fromPx } from '@mermaid-js/core/layout';
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import { tagsOnly } from '@mermaid-js/core/text/tags-only';
import type { MindmapModel, MindmapShape } from '../model.ts';
import type { MindmapLayoutContext } from './context.ts';
import { MINDMAP_METRICS, type ShapeMetrics } from './metrics.ts';
import { v12Label } from '@mermaid-js/core/text/v12-label';
import { bangOutline, cloudOutline, outlineBox, type Outline, type Point } from './outline.ts';

/** A config value the layout can't honour (pitfall 22): it lays out with the default instead. */
export const MINDMAP_CONFIG_IGNORED = 'MINDMAP_CONFIG_IGNORED';

/** Where a node's `::icon()` goes (D297): a `slot` square centred at `at`, the glyph inside it. */
export interface MindmapIconSlot {
  /** The slot's centre, from the frame's centre. */
  readonly at: Point;
  /** Side of the slot square; the reference as written is shown in it when no glyph is drawn. */
  readonly slot: number;
  /** Side of the glyph, centred in the slot. */
  readonly glyph: number;
  /**
   * The reference as written (trimmed), laid out in `size` px, the theme's font size or less so
   * that it fits the glyph square: what is drawn when no glyph is (D286, D291).
   */
  readonly text: MeasuredLabel;
  readonly size: number;
}

export interface MindmapNodeView {
  /** Layout node id: the node's AST id (unique, D289). */
  readonly id: string;
  /** Index into `MindmapModel.nodes`. */
  readonly index: number;
  /**
   * The shape drawn: the node's, except that a plain node is `rounded` where the theme's
   * `mindmapRoundedNodes` is on (v12 redux, D288).
   */
  readonly shape: MindmapShape;
  readonly label: MeasuredLabel;
  /** The layout box: what the shape draws fits it exactly. */
  readonly width: number;
  readonly height: number;
  /**
   * The shape's own frame, the `w` × `h` v12's formulas give (a circle's is its diameter both
   * ways), centred `dx`, `dy` from the box's centre. Only a cloud or a bang bulges out of it.
   */
  readonly frame: {
    readonly dx: number;
    readonly dy: number;
    readonly width: number;
    readonly height: number;
  };
  /** The label's centre, from the frame's centre. */
  readonly labelAt: Point;
  /** A hexagon's point depth (`h / f`). */
  readonly point?: number;
  /** A cloud's or a bang's path, in the frame's coordinates (centre at 0). */
  readonly outline?: Outline;
  readonly icon?: MindmapIconSlot;
}

export interface MindmapEdgeView {
  /** `edge:<child's AST id>`: unique (a child has one parent) and never a node id. */
  readonly id: string;
  /** Layout ids of the parent and the child. */
  readonly source: string;
  readonly target: string;
  /** Index of the child in `MindmapModel.nodes`. */
  readonly child: number;
}

export interface MindmapPrepared {
  readonly graph: LayoutGraph;
  /** In model order. */
  readonly nodes: readonly MindmapNodeView[];
  /** One per non-root node, in model order. */
  readonly edges: readonly MindmapEdgeView[];
}

/** A whole decimal number, spaces around it allowed: `"20"`, `" 20 "`, `"2.5"`; not `"20px"`. */
const NUMERIC = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?\s*$/i;

/**
 * A config length (a number, or a whole numeric string, as v12 takes it) of at least 0, or above
 * 0 when `positive`; else the default, with a warning when the key is set.
 */
function lengthOf(
  ctx: MindmapLayoutContext,
  value: unknown,
  fallback: number,
  path: string,
  positive: boolean
): number {
  // Any other string stays a string, and so is not taken.
  const n = typeof value === 'string' && NUMERIC.test(value) ? Number(value) : value;
  if (typeof n === 'number' && Number.isFinite(n) && (positive ? n > 0 : n >= 0)) return n;
  if (value !== undefined)
    ctx.warn({
      code: MINDMAP_CONFIG_IGNORED,
      message: `Ignored ${path}: it is not a number ${positive ? 'above' : 'of at least'} 0; using ${fallback}`,
      path,
    });
  return fallback;
}

interface Build {
  readonly ctx: MindmapLayoutContext;
  readonly font: FontKey;
  /** Wrap width, units. */
  readonly wrap: number;
  /** `mindmap.padding`, px, and in units across and down. */
  readonly paddingPx: number;
  readonly padding: Point;
  /** The theme draws plain nodes rounded (`mindmapRoundedNodes`, D288). */
  readonly rounded: boolean;
  /** A px length along an axis, in units. */
  px(v: number, axis: 'x' | 'y'): number;
}

interface Frame {
  width: number;
  height: number;
  /** A bang's width before its least growth (`bang.ts` `w`): its arcs' radius is `0.15` of it. */
  arcWidth: number;
  labelAt: Point;
  icon?: MindmapIconSlot;
}

/**
 * A shape's padding along `axis`, units: the theme's padding variable where the shape has one
 * (v12 neo and classic differ, D152), with the fixed or `mindmap.padding`-based padding it
 * multiplies; else that padding.
 */
function padOf(b: Build, m: ShapeMetrics, axis: 'x' | 'y'): number {
  const base = m.pad ?? b.paddingPx * m.padScale;
  const name = m.themed?.[axis];
  return b.px(name === undefined ? base : b.ctx.theme.padding(name, base), axis);
}

/** A hexagon's slant: the theme's `hexagonSlant` when above 0, else v12 classic's. */
function slantOf(b: Build, m: ShapeMetrics): number | undefined {
  if (m.slant === undefined) return undefined;
  const f = b.ctx.theme.number('hexagonSlant');
  return Number.isFinite(f) && f > 0 ? f : m.slant;
}

/** The frame round a `label`, with the icon slot when there is one (D297). */
function frameOf(b: Build, shape: MindmapShape, label: MeasuredLabel, icon?: IconText): Frame {
  const m: ShapeMetrics = MINDMAP_METRICS.shapes[shape];
  const pad = (axis: 'x' | 'y'): number => padOf(b, m, axis);
  const { slot, minHeight, glyph } = MINDMAP_METRICS.icon;
  const iconAcross = b.px(slot, 'x');
  const iconDown = b.px(slot, 'y');
  let width: number;
  let height: number;
  if (shape === 'circle') {
    const d = Math.hypot(label.width, label.height) + 2 * pad('x');
    if (!icon) return { width: d, height: d, arcWidth: d, labelAt: { x: 0, y: 0 } };
    // The icon row sits above the label; the two are centred together.
    return {
      width: d + iconAcross,
      arcWidth: d + iconAcross,
      height: d + iconDown,
      labelAt: { x: 0, y: iconDown / 2 },
      icon: {
        at: { x: 0, y: -label.height / 2 },
        slot: iconDown,
        glyph: b.px(glyph, 'y'),
        ...icon,
      },
    };
  }
  width = label.width + m.grow.x * pad('x');
  height = label.height + m.grow.y * pad('y');
  const unclamped = width;
  if (m.minGrow !== undefined) {
    width = Math.max(width, label.width + b.px(m.minGrow, 'x'));
    height = Math.max(height, label.height + b.px(m.minGrow, 'y'));
  }
  const slant = slantOf(b, m);
  if (slant !== undefined) width += (2 * height) / slant;
  if (!icon) return { width, height, arcWidth: unclamped, labelAt: { x: 0, y: 0 } };
  // The icon sits left of the label; the two are centred together.
  return {
    width: width + iconAcross,
    arcWidth: unclamped + iconAcross,
    height: Math.max(height, b.px(minHeight, 'y')),
    labelAt: { x: iconAcross / 2, y: 0 },
    icon: { at: { x: -label.width / 2, y: 0 }, slot: iconAcross, glyph: b.px(glyph, 'x'), ...icon },
  };
}

interface IconText {
  readonly text: MeasuredLabel;
  readonly size: number;
}

/**
 * The `::icon()` reference as written (D286), on one line per line written, in the theme's
 * font made smaller where it would not fit the glyph square.
 */
function iconText(b: Build, raw: string): IconText {
  const side = b.px(MINDMAP_METRICS.icon.glyph, 'x');
  const text = raw.trim();
  const at = (size: number): MeasuredLabel =>
    layoutLabel(text, { ...b.font, size }, Number.MAX_SAFE_INTEGER, b.ctx.measurer, {
      inline: tagsOnly(b.ctx.inline),
    });
  const full = at(b.font.size);
  const fit = Math.min(1, side / Math.max(full.width, 1), side / Math.max(full.height, 1));
  if (fit >= 1) return { text: full, size: b.font.size };
  const size = b.font.size * fit;
  return { text: at(size), size };
}

function nodeView(b: Build, model: MindmapModel, index: number): MindmapNodeView {
  const node = model.nodes[index]!;
  // v12's HTML labels kept a long word whole and widened the node (#649).
  // Bullets and inline code are read in a markdown string only (D562).
  const [shown, mode] =
    node.markdown === true ? [node.label, { markup: 'markdown' as const }] : v12Label(node.label);
  const label = layoutLabel(shown, b.font, b.wrap, b.ctx.measurer, {
    ...mode,
    inline: b.ctx.inline,
    keepWords: b.ctx.units.id !== 'cell',
  });
  const shape = node.shape === 'default' && b.rounded ? 'rounded' : node.shape;
  const f = frameOf(b, shape, label, node.icon && iconText(b, node.icon.text));
  const base = {
    id: node.ast,
    index,
    shape,
    label,
    labelAt: f.labelAt,
    ...(f.icon ? { icon: f.icon } : {}),
  };
  if (shape === 'cloud' || shape === 'bang') {
    const outline =
      shape === 'cloud'
        ? cloudOutline(f.width, f.height)
        : bangOutline(f.width, f.height, f.arcWidth);
    const box = outlineBox(outline);
    return {
      ...base,
      width: box.x1 - box.x0,
      height: box.y1 - box.y0,
      frame: {
        dx: -(box.x0 + box.x1) / 2,
        dy: -(box.y0 + box.y1) / 2,
        width: f.width,
        height: f.height,
      },
      outline,
    };
  }
  const slant = slantOf(b, MINDMAP_METRICS.shapes[shape]);
  return {
    ...base,
    width: f.width,
    height: f.height,
    frame: { dx: 0, dy: 0, width: f.width, height: f.height },
    ...(slant === undefined ? {} : { point: f.height / slant }),
  };
}

/** Measures the model and builds the graph the layout engine gets. */
export function prepareMindmap(model: MindmapModel, ctx: MindmapLayoutContext): MindmapPrepared {
  const units = ctx.units;
  const conf = ctx.config.mindmap ?? {};
  const px = (v: number, axis: 'x' | 'y'): number => fromPx(units, v, axis);
  const padding = lengthOf(ctx, conf.padding, MINDMAP_METRICS.padding, 'mindmap.padding', false);
  const maxWidth = lengthOf(
    ctx,
    conf.maxNodeWidth,
    MINDMAP_METRICS.maxNodeWidth,
    'mindmap.maxNodeWidth',
    true
  );
  const b: Build = {
    ctx,
    font: {
      family: ctx.theme.value('fontFamily'),
      size: ctx.theme.number('fontSize'),
      weight: MINDMAP_METRICS.fontWeight,
    },
    wrap: Math.max(px(maxWidth, 'x'), MINDMAP_METRICS.minWrap),
    paddingPx: padding,
    padding: { x: px(padding, 'x'), y: px(padding, 'y') },
    rounded: ctx.theme.value('mindmapRoundedNodes') === 'true',
    px,
  };
  const nodes = model.nodes.map((_, i) => nodeView(b, model, i));
  const edges: MindmapEdgeView[] = [];
  model.nodes.forEach((n, i) => {
    if (n.parent === undefined) return;
    const source = nodes[n.parent]!.id;
    const target = nodes[i]!.id;
    // A child has one parent, so its AST id names the edge; no node id starts `edge:`.
    edges.push({ id: `edge:${target}`, source, target, child: i });
  });
  const graph: LayoutGraph = {
    // v12 handed its engines `TB` (`mindmapDb.ts` `getData`); `tree` takes no direction.
    direction: 'TB',
    nodes: nodes.map(
      (v): LayoutNode => ({ id: v.id, width: v.width, height: v.height, shape: v.shape })
    ),
    edges: edges.map(
      (e): LayoutEdge => ({ id: e.id, source: e.source, target: e.target, minLen: 1 })
    ),
    groups: [],
    spacing: {
      node: px(MINDMAP_METRICS.spacing.node, 'y'),
      rank: px(MINDMAP_METRICS.spacing.rank, 'x'),
      edge: units.builder.spacing.edge,
    },
    // v12's margin round the drawing is `mindmap.padding` (`setupViewPortForSVG`).
    diagramPadding: b.padding.x,
  };
  return { graph, nodes, edges };
}
