// Draws a laid-out requirement diagram through the SvgWriter (DESIGN §7, spec #520 T4). The
// structure is v12's unified render (`edgePaths`, `edgeLabels`, `nodes`) with its class names
// (`node default`, `label-container outer-path`, `divider`, `relationshipLine`,
// `edge-pattern-*`, `requirementDiagramTitleText`); each box's `g.node` and each relation's
// `path` carries `data-ast` (D437, R-PARSE-8), labels `data-id` only. Colours and sizes come
// from the package's theme table (D152, D435); outlines and lines go through `w.outline`
// (D301, D302), the markers are plain.
import {
  translate,
  type Attrs,
  type OutlinePaint,
  type Paint,
  type SafeValue,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import { pxProfile } from '@mermaid-js/core/layout';
import {
  cls,
  openSvgRoot,
  paletteSlots,
  titleAt,
  titledViewBox,
} from '@mermaid-js/shared/svg/document';
import { edgeLabel } from '@mermaid-js/shared/svg/graph';
import { routePath } from '@mermaid-js/shared/svg/route';
import type { RequirementRenderContext } from '../layout/context.ts';
import type { RequirementLayout } from '../layout/layout.ts';
import { REQUIREMENT_METRICS as M } from '../layout/metrics.ts';
import {
  prepareRequirement,
  type BoxView,
  type RelationView,
  type RequirementPrepared,
} from '../layout/prepare.ts';
import type { RequirementModel } from '../model.ts';
import { drawMarker } from './markers.ts';

// The dash of every relation but `contains` (v12 `stroke-dasharray: 10,7`).
const DASH = M.dash.join(',') as SafeValue;

type ThemeOf = RequirementRenderContext['theme'];
type Color = ReturnType<ThemeOf['color']>;
type Length = ReturnType<ThemeOf['length']>;

interface Tint {
  readonly id: `color-${number}`;
  readonly stroke: Paint;
  readonly fill?: Paint;
}

interface Paints {
  readonly font: ReturnType<ThemeOf['font']>;
  readonly fontSize: Length;
  readonly box: {
    readonly fill: Color;
    /** The theme's gradient when `useGradient` is on (D182, v12 neo's `.node path`). */
    readonly stroke: OutlinePaint;
    readonly strokeWidth: Length;
    readonly text: Color;
    /** The theme's drop shadow (v12 neo's `.outer-path`); none in the classic themes. */
    readonly shadow: ReturnType<ThemeOf['filter']> | undefined;
    /** How far a divider in `stroke` is lifted: `dividerLift` under the gradient, else 0. */
    readonly lift: number;
  };
  /** Set exactly when there are relations, the only time `drawRelation*` runs. */
  readonly line?: { readonly stroke: Color; readonly strokeWidth: Length };
  /** Set exactly when there are relations, as `line`. */
  readonly label?: { readonly fill: Color; readonly text: Color };
  readonly title?: Color;
  readonly slotOf: (slot: number) => Tint | undefined;
}

/**
 * Every theme variable the body uses, looked up before the root is written, so the root
 * `style` declares exactly the aliases used (`theme.rootStyle()`).
 */
function paints(theme: ThemeOf, p: RequirementPrepared): Paints {
  const relations = p.relations.length > 0;
  return {
    font: theme.font(),
    fontSize: theme.length('fontSize'),
    box: {
      fill: theme.color('requirementBackground'),
      stroke: theme.outline('requirementBorderColor'),
      strokeWidth: theme.length('requirementBorderSize'),
      text: theme.color('requirementTextColor'),
      shadow: theme.value('dropShadow') === 'none' ? undefined : theme.filter('dropShadow'),
      lift: theme.gradient() ? M.dividerLift : 0,
    },
    line: relations
      ? { stroke: theme.color('relationColor'), strokeWidth: theme.length('relationStrokeWidth') }
      : undefined,
    label: relations
      ? {
          fill: theme.color('relationLabelBackground'),
          text: theme.color('relationLabelColor'),
        }
      : undefined,
    // v12's title has no rule of its own: it takes the root's `fill: textColor`.
    title: p.title ? theme.color('textColor') : undefined,
    slotOf: paletteSlots(theme),
  };
}

/** What every section of one render draws from. */
interface Scene {
  readonly w: SvgWriter;
  readonly layout: RequirementLayout;
  readonly p: RequirementPrepared;
  readonly ctx: RequirementRenderContext;
  readonly paint: Paints;
}

/** Writes the whole `<svg>` document for a laid-out requirement diagram. */
export function renderRequirement(
  model: RequirementModel,
  layout: RequirementLayout,
  ctx: RequirementRenderContext,
  w: SvgWriter
): void {
  const p = layout.requirement ?? prepareRequirement(model, ctx);
  const scene: Scene = { w, layout, p, ctx, paint: paints(ctx.theme, p) };
  // v12 writes the title centred over the drawing with its baseline `titleTopMargin` (25) above
  // the layout's origin, so 33 above the boxes' top, then fits the viewBox to everything with 8
  // around it (`setupViewPortForSVG`; D218, D652).
  const title = p.title && titleAt(p.title, layout.width, M.titleMargin);
  openRoot(scene, model, titledViewBox(layout, title, M.viewBoxPadding));
  w.open('g', { class: 'edgePaths', fill: 'none' });
  for (const r of p.relations) drawRelation(scene, r);
  w.close();
  w.open('g', { class: 'edgeLabels' });
  for (const r of p.relations) drawRelationLabel(scene, r);
  w.close();
  w.open('g', { class: 'nodes', fill: scene.paint.box.text });
  for (const box of p.boxes) drawBox(scene, box);
  w.close();
  if (title) {
    w.label(title.label, title.x, title.y, {
      class: 'requirementDiagramTitleText',
      fill: scene.paint.title,
    });
  }
  w.close();
}

/** The `<svg>` root with its title and description (R-A11Y-1). */
function openRoot(
  { w, ctx, paint }: Scene,
  model: RequirementModel,
  viewBox: ReturnType<typeof titledViewBox>
): void {
  openSvgRoot(w, ctx, {
    name: 'requirement requirementDiagram',
    viewBox,
    maxWidth: ctx.config.requirement?.useMaxWidth !== false,
    title: model.accTitle,
    desc: model.accDescr,
    attrs: {
      'font-family': paint.font,
      'font-size': paint.fontSize,
    },
  });
}

function drawRelation({ w, layout, p, paint }: Scene, r: RelationView): void {
  const route = layout.edges.get(r.id);
  if (!route || route.points.length < 2) return;
  const line = paint.line!;
  // A self-loop's legs are short: rounded corners, whatever the curve (as class).
  const path = routePath(w, route.points, r.source === r.target ? 'rounded' : p.curve, 0, 0);
  w.outline('edge', 'path', {
    class:
      'edge-thickness-normal edge-pattern-' + (r.dashed ? 'dashed' : 'solid') + ' relationshipLine',
    'data-id': r.dataId,
    'data-ast': r.id,
    d: path.d,
    stroke: line.stroke,
    'stroke-width': line.strokeWidth,
    'stroke-dasharray': r.dashed ? DASH : undefined,
  });
  // `sdx`/`edx` point the way a marker points, into the box; the marker is drawn out from it.
  const end =
    r.markerAt === 'source'
      ? { x: path.sx, y: path.sy, ux: -path.sdx, uy: -path.sdy }
      : { x: path.ex, y: path.ey, ux: -path.edx, uy: -path.edy };
  // A px layout always has the markers it made room for (only a cell layout has none).
  if (p.markers) drawMarker(w, r.marker, end, line.stroke, p.markers, r.dataId);
}

/**
 * A relation's label as the shared tag (D626–D628): bordered 1 px solid in the relation colour,
 * solid on dashed lines too, and as large as the room the layout reserved (`labelPatch`, D629).
 */
function drawRelationLabel({ w, layout, ctx, paint }: Scene, r: RelationView): void {
  const at = layout.edges.get(r.id)?.label;
  if (!at || r.label.width === 0) return;
  const label = paint.label!;
  edgeLabel(w, r.label, at, r.dataId, {
    fill: label.fill,
    stroke: paint.line!.stroke,
    text: { fill: label.text },
    patch: (ctx.units ?? pxProfile).builder.labelPatch,
  });
}

function drawBox({ w, layout, ctx, paint }: Scene, view: BoxView): void {
  const placed = layout.nodes.get(view.id);
  if (!placed) return;
  const slot = paint.slotOf(view.slot);
  const boxPaint = paint.box;
  const shape = view.style.shape;
  w.open('g', {
    class: 'node' + cls(view.classes),
    'data-id': view.box.name,
    'data-ast': view.id,
    'data-color-id': slot?.id,
    transform: translate(placed.x, placed.y),
  });
  const left = -view.width / 2;
  const top = -view.height / 2;
  // The author's `style` / `classDef` wins over the palette (v12 put them inline, over the
  // palette's CSS), so it is spread after.
  const outline: Attrs = {
    fill: slot?.fill ?? boxPaint.fill,
    stroke: slot?.stroke ?? boxPaint.stroke,
    'stroke-width': boxPaint.strokeWidth,
    ...shape,
  };
  w.outline('node', 'rect', {
    class: 'basic label-container outer-path',
    x: left,
    y: top,
    width: view.width,
    height: view.height,
    filter: boxPaint.shadow,
    ...outline,
  });
  const ink = shape.fill ? ctx.theme.ink(shape.fill) : undefined;
  const text: Attrs = { fill: ink, ...view.style.text };
  for (const line of view.lines) {
    const label = line.align === 'start' ? { ...line.label, left: true } : line.label;
    w.label(label, left + line.x + line.label.width / 2, top + line.y + line.label.height / 2, {
      class: `label ${line.part}`,
      ...text,
    });
  }
  if (view.divider !== undefined) {
    // Lifted only where the gradient strokes it; an author's or the palette's stroke is plain.
    const lift = outline.stroke === boxPaint.stroke ? boxPaint.lift : 0;
    drawDivider(w, view, outline, left, top, lift);
  }
  w.close();
}

/**
 * The rule between the name and the body, alone, so an outline drawer sketches it once. Under
 * the gradient (D182) its right end is lifted `lift` so its box has a height and the
 * objectBoundingBox gradient paints it (D185, as class's dividers and v12 neo's 0.001-tall
 * polygon); the gradient's colour runs along it as along the outline.
 */
function drawDivider(
  w: SvgWriter,
  view: BoxView,
  outline: Attrs,
  left: number,
  top: number,
  lift: number
): void {
  const y = top + view.divider!;
  const rule = w
    .path()
    .moveTo(left, y)
    .lineTo(left + view.width, y - lift)
    .done();
  w.open('g', { class: 'divider' });
  w.outline('divider', 'path', {
    d: rule,
    fill: 'none',
    stroke: outline.stroke,
    'stroke-width': outline['stroke-width'],
    'stroke-dasharray': outline['stroke-dasharray'],
    'stroke-opacity': outline['stroke-opacity'],
    opacity: outline.opacity,
  });
  w.close();
}
