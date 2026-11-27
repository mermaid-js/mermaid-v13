/**
 * ArchitectureModel → LayoutGraph (spec #525 T3, D326, D501): measures every label first with
 * the injected measurer in the font it is drawn in (pitfall 16), sizes services, junctions and
 * groups as v12 drew them, and hands `compass` the sides, `{group}` flags and `align` hints.
 * Every length comes from the metrics table (`metrics.ts`, pitfall 13).
 *
 * - A service is its `iconSize` icon with its label beneath, wrapped at `iconSize × 1.5`: as
 *   wide as the wider of the two, `iconSize` + the label's height high, and its `left`/`right`
 *   ends meet the icon's centre line (`anchorY`, D501).
 * - A junction is v12's invisible `iconSize` square, with no label.
 * - A group has `padding` on every side and a title band: its icon, then 4 px and its label.
 * - An edge names both its sides, its `{group}` ends (`border`) and its label's size; the
 *   label is measured unwrapped, since v12 wrapped it to the drawn edge (D507: the renderer
 *   places it).
 * - Every `align` statement is one `align` hint, in source order.
 *
 * The lists are read in the model's order (v12's insertion order), so the graph, and with it
 * the layout, is the same on every run.
 */
import {
  pxProfile,
  type LayoutEdge,
  type LayoutGraph,
  type LayoutGroup,
  type LayoutNode,
  type Side,
  type Size,
} from '@mermaid-js/core/layout';
import {
  layoutLabel,
  markdownString,
  type FontKey,
  type MeasuredLabel,
} from '@mermaid-js/core/text';
import { configLengths } from '@mermaid-js/shared/config/readers';
import { ARCHITECTURE_CONFIG_IGNORED } from '../codes.ts';
import { architectureConfigDefaults } from '../generated/config-defaults.ts';
import type { ArchitectureModel, ArchitectureSide } from '../model.ts';
import type { ArchitectureLayoutContext } from './context.ts';
import { ARCHITECTURE_METRICS, architectureSizes, type ArchitectureSizes } from './metrics.ts';

/** A service or junction as laid out. */
export interface ArchitectureNodeView {
  /** The id as written: the layout node's id. */
  readonly id: string;
  readonly kind: 'service' | 'junction';
  /** Index into the model's `services` or `junctions`. */
  readonly index: number;
  /** A service's label, wrapped at `labelWidth`; absent for a junction or no label. */
  readonly label?: MeasuredLabel;
}

export interface ArchitectureGroupView {
  readonly id: string;
  /** Index into the model's `groups`. */
  readonly index: number;
  /** The label, unwrapped; absent when none. */
  readonly label?: MeasuredLabel;
  /** The title band handed to the engine: the icon, then the label; absent when neither. */
  readonly title?: Size;
}

export interface ArchitectureEdgeView {
  /** The edge's AST id (`edge:a->b`, `@2` on a repeat, D508): the layout edge's id. */
  readonly id: string;
  /** Index into the model's `edges`. */
  readonly index: number;
  /** The `-[label]-` text, unwrapped; absent for `--`. */
  readonly label?: MeasuredLabel;
}

export interface ArchitecturePrepared {
  readonly graph: LayoutGraph;
  /** The document's lengths (`iconSize`, `padding` and what v12 drew with them). */
  readonly sizes: ArchitectureSizes;
  /** The font every label was measured in. */
  readonly font: FontKey;
  /** Services in model order, then junctions in model order. */
  readonly nodes: readonly ArchitectureNodeView[];
  readonly groups: readonly ArchitectureGroupView[];
  readonly edges: readonly ArchitectureEdgeView[];
}

const SIDE: Readonly<Record<ArchitectureSide, Side>> = {
  L: 'left',
  R: 'right',
  T: 'top',
  B: 'bottom',
};

/**
 * The document's `iconSize` and `padding` (0 up to 10000, as the other ports read lengths; else
 * the section's generated default, v12's, with one `ARCHITECTURE_CONFIG_IGNORED` per key), and
 * the lengths v12 drew with them. Read once per layout: renderers take `ArchitecturePrepared.sizes`.
 */
function sizesOf(ctx: ArchitectureLayoutContext): ArchitectureSizes {
  const D = architectureConfigDefaults;
  const length = configLengths(
    'architecture',
    ARCHITECTURE_CONFIG_IGNORED,
    (ctx.config.architecture ?? {}) as Readonly<Record<string, unknown>>,
    D,
    ctx.warn
  );
  return architectureSizes(length('iconSize') ?? D.iconSize!, length('padding') ?? D.padding!);
}

/**
 * A group's title band: its icon, then the label `groupLabelGap` past the icon or past the corner
 * (v12 `svgDraw.ts:263`), as high as the taller; absent with neither.
 */
function titleOf(
  icon: boolean,
  label: MeasuredLabel | undefined,
  sizes: ArchitectureSizes
): Size | undefined {
  if (!icon && !label) return undefined;
  const w = icon ? sizes.groupIcon : 0;
  return {
    width: w + (label ? sizes.groupLabelGap + label.width : 0),
    height: Math.max(w, label?.height ?? 0),
  };
}

/** Measures the model and builds the graph `compass` (or the engine `layout` names) gets. */
export function prepareArchitecture(
  model: ArchitectureModel,
  ctx: ArchitectureLayoutContext
): ArchitecturePrepared {
  const sizes = sizesOf(ctx);
  const { iconSize, padding, anchorY } = sizes;
  // v12 drew every label in the global font (D507: `architecture.fontSize` is ignored).
  const font: FontKey = {
    family: ctx.theme.value('fontFamily'),
    size: ctx.theme.number('fontSize'),
    weight: ARCHITECTURE_METRICS.fontWeight,
  };
  // A markdown string is laid out as markdown without its wrapper; any other label is plain
  // (D710, a break with v12, whose `createText` read markdown in every label).
  const measure = (text: string | undefined, maxWidth: number): MeasuredLabel | undefined => {
    if (text === undefined || text.trim() === '') return undefined;
    const { text: source, markup } = markdownString(text);
    return layoutLabel(source, font, maxWidth, ctx.measurer, { markup, inline: ctx.inline });
  };

  const nodes: ArchitectureNodeView[] = [];
  const layoutNodes: LayoutNode[] = [];
  for (const [index, s] of model.services.entries()) {
    const label = measure(s.title, sizes.labelWidth);
    const width = Math.max(iconSize, label?.width ?? 0);
    const height = iconSize + (label?.height ?? 0);
    nodes.push({ id: s.id, kind: 'service', index, ...(label ? { label } : {}) });
    layoutNodes.push({
      id: s.id,
      width,
      height,
      anchorY,
      shape: 'service',
      ...(s.in === undefined ? {} : { parent: s.in }),
    });
  }
  for (const [index, j] of model.junctions.entries()) {
    nodes.push({ id: j.id, kind: 'junction', index });
    layoutNodes.push({
      id: j.id,
      width: iconSize,
      height: iconSize,
      anchorY,
      shape: 'junction',
      ...(j.in === undefined ? {} : { parent: j.in }),
    });
  }

  const groups: ArchitectureGroupView[] = [];
  const layoutGroups: LayoutGroup[] = [];
  for (const [index, g] of model.groups.entries()) {
    const label = measure(g.title, Infinity);
    const title = titleOf(g.icon !== undefined, label, sizes);
    groups.push({ id: g.id, index, ...(label ? { label } : {}), ...(title ? { title } : {}) });
    layoutGroups.push({
      id: g.id,
      ...(g.in === undefined ? {} : { parent: g.in }),
      padding: { top: padding, right: padding, bottom: padding, left: padding },
      ...(title ? { title } : {}),
    });
  }

  const edges: ArchitectureEdgeView[] = [];
  const layoutEdges: LayoutEdge[] = [];
  for (const [index, e] of model.edges.entries()) {
    const label = measure(e.title, Infinity);
    edges.push({ id: e.astId, index, ...(label ? { label } : {}) });
    layoutEdges.push({
      id: e.astId,
      source: e.lhsId,
      target: e.rhsId,
      minLen: 1,
      sides: { source: SIDE[e.lhsDir], target: SIDE[e.rhsDir] },
      // `lhsGroup`/`rhsGroup` are already false on an end in no group (D504).
      ...(e.lhsGroup || e.rhsGroup ? { border: { source: e.lhsGroup, target: e.rhsGroup } } : {}),
      ...(label ? { label: { width: label.width, height: label.height } } : {}),
    });
  }

  const align = model.alignments.map((a) => ({ axis: a.direction, members: a.members }));
  const graph: LayoutGraph = {
    // Every edge names both sides, so `direction` decides nothing (D327 derives sides from it).
    direction: 'TB',
    nodes: layoutNodes,
    edges: layoutEdges,
    groups: layoutGroups,
    // `compass` reads no spacing (its cell gap is its own, GAPS T0); other engines get core's
    // defaults, not the group `padding` (at 0 it packed them edge to edge).
    spacing: pxProfile.builder.spacing,
    // v12's margin round the drawing is `padding` (`setupGraphViewbox`).
    diagramPadding: padding,
    ...(align.length > 0 ? { align } : {}),
  };
  return { graph, sizes, font, nodes, groups, edges };
}
