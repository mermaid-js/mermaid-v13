// Draws a laid-out requirement diagram through the SvgWriter (DESIGN §7, spec #520 T4). The
// structure is v12's unified render (`edgePaths`, `edgeLabels`, `nodes`) with its class names
// (`node default`, `label-container outer-path`, `divider`, `relationshipLine`,
// `edge-pattern-*`, `requirementDiagramTitleText`); each box's `g.node` and each relation's
// `path` carries `data-ast` (D437, R-PARSE-8), labels `data-id` only. Colours and sizes come
// from the package's theme table (D152, D435); outlines and lines go through `w.outline`
// (D301, D302), the markers are plain.
import {
  px,
  styleScope,
  styleText,
  themeStyleSheet,
  translate,
  type Attrs,
  type OutlinePaint,
  type Paint,
  type SafeValue,
  type SvgWriter,
} from '@mermaid-js/core/svg';
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
import { routePath } from './route.ts';

// The dash of every relation but `contains` (v12 `stroke-dasharray: 10,7`).
const DASH = M.dash.join(',') as SafeValue;

const cls = (names: readonly string[]): string => {
  let out = '';
  for (const n of names) {
    const c = n.replace(/[^\w-]/g, '');
    if (c) out += ' ' + c;
  }
  return out;
};

type ThemeOf = RequirementRenderContext['theme'];
type Color = ReturnType<ThemeOf['color']>;
type Length = ReturnType<ThemeOf['length']>;

interface Tint {
  readonly id: `color-${number}`;
  readonly stroke: Paint;
  readonly fill?: Paint;
}

/**
 * Per-box palette colour (v12 `requirementBox.ts`, `data-color-id`, and `styles.js`
 * `genColor`): on only when the theme carries a non-empty `borderColorArray`, never by theme
 * name (D152). The slot is the box's (v12's `colorIndex`: requirements first, then elements)
 * modulo the palette; the fill comes from `bkgColorArray` only when that is not empty.
 */
function paletteSlots(theme: ThemeOf): (slot: number) => Tint | undefined {
  const border = theme.palette('borderColorArray');
  const bkg = theme.palette('bkgColorArray');
  return (n) => {
    if (border.length === 0) return undefined;
    const slot = n % border.length;
    return {
      id: `color-${slot}`,
      stroke: border[slot]!,
      fill: bkg.length > 0 ? bkg[n % bkg.length] : undefined,
    };
  };
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
  };
  readonly line?: { readonly stroke: Color; readonly strokeWidth: Length };
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

/** The drawing's box: the layout's, grown for the title above it (v12 `insertTitle`). */
interface Frame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The title's centre. */
  readonly title?: { readonly x: number; readonly y: number };
}

/**
 * v12 writes the title centred over the drawing with its baseline `titleTopMargin` (25) above
 * the layout's origin, so 33 above the boxes' top, then fits the viewBox to everything with 8
 * around it (`setupViewPortForSVG`).
 */
function frameOf(layout: RequirementLayout, p: RequirementPrepared): Frame {
  const width = Math.max(1, layout.width);
  const height = Math.max(1, layout.height);
  const t = p.title;
  if (!t) return { x: 0, y: 0, width, height };
  const cx = layout.width / 2;
  const top = -M.titleMargin - t.baseline;
  const pad = M.viewBoxPadding;
  const x0 = Math.min(0, cx - t.width / 2 - pad);
  const x1 = Math.max(width, cx + t.width / 2 + pad);
  const y0 = Math.min(0, top - pad);
  return {
    x: x0,
    y: y0,
    width: x1 - x0,
    height: height - y0,
    title: { x: cx, y: top + t.height / 2 },
  };
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
  const frame = frameOf(layout, p);
  openRoot(scene, model, frame);
  // v12 numbers each edge by the relation's place among all of them (`getData`).
  const order = new Map(model.relations.map((r, i) => [r, i]));
  const dataId = (r: RelationView): string =>
    `${r.relation.src}-${r.relation.dst}-${order.get(r.relation) ?? 0}`;
  w.open('g', { class: 'edgePaths', fill: 'none' });
  for (const r of p.relations) drawRelation(scene, r, dataId(r));
  w.close();
  w.open('g', { class: 'edgeLabels' });
  for (const r of p.relations) drawRelationLabel(scene, r, dataId(r));
  w.close();
  w.open('g', { class: 'nodes', fill: scene.paint.box.text });
  for (const box of p.boxes) drawBox(scene, box);
  w.close();
  if (p.title && frame.title) {
    w.label(p.title, frame.title.x, frame.title.y, {
      class: 'requirementDiagramTitleText',
      fill: scene.paint.title,
    });
  }
  w.close();
}

/** The `<svg>` root with its title and description (R-A11Y-1). */
function openRoot({ w, ctx, paint }: Scene, model: RequirementModel, frame: Frame): void {
  const { theme, config } = ctx;
  const prefix = (): string => ctx.idPrefix ?? 'mermaid';
  const x = Math.floor(frame.x);
  const y = Math.floor(frame.y);
  const width = Math.max(1, Math.ceil(frame.x + frame.width) - x);
  const height = Math.max(1, Math.ceil(frame.y + frame.height) - y);
  const maxWidth = config.requirement?.useMaxWidth !== false;
  const auto = theme.autoDeclarations();
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-requirement requirementDiagram',
    viewBox: [x, y, width, height],
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : height,
    role: 'img',
    'aria-roledescription': 'requirement',
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

function drawRelation({ w, layout, p, paint }: Scene, r: RelationView, dataId: string): void {
  const route = layout.edges.get(r.id);
  if (!route || route.points.length < 2 || !paint.line) return;
  // A self-loop's legs are short: rounded corners, whatever the curve (as class).
  const path = routePath(w, route.points, r.source === r.target ? 'rounded' : p.curve, 0, 0);
  w.outline('edge', 'path', {
    class:
      'edge-thickness-normal edge-pattern-' + (r.dashed ? 'dashed' : 'solid') + ' relationshipLine',
    'data-id': dataId,
    'data-ast': r.id,
    d: path.d,
    stroke: paint.line.stroke,
    'stroke-width': paint.line.strokeWidth,
    'stroke-dasharray': r.dashed ? DASH : undefined,
  });
  // `sdx`/`edx` point the way a marker points, into the box; the marker is drawn out from it.
  const end =
    r.markerAt === 'source'
      ? { x: path.sx, y: path.sy, ux: -path.sdx, uy: -path.sdy }
      : { x: path.ex, y: path.ey, ux: -path.edx, uy: -path.edy };
  drawMarker(w, r.marker, end, paint.line.stroke, p.markers, dataId);
}

function drawRelationLabel({ w, layout, paint }: Scene, r: RelationView, dataId: string): void {
  const at = layout.edges.get(r.id)?.label;
  if (!at || r.label.width === 0 || !paint.label) return;
  const lw = r.label.width + 2 * M.labelPad;
  w.open('g', { class: 'edgeLabel', 'data-id': dataId });
  w.leaf('rect', {
    class: 'labelBkg',
    x: at.x - lw / 2,
    y: at.y - r.label.height / 2,
    width: lw,
    height: r.label.height,
    fill: paint.label.fill,
  });
  w.label(r.label, at.x, at.y, { fill: paint.label.text });
  w.close();
}

function drawBox({ w, layout, ctx, paint }: Scene, view: BoxView): void {
  const placed = layout.nodes.get(view.id);
  if (!placed) return;
  const slot = paint.slotOf(view.slot);
  const b = paint.box;
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
    fill: slot?.fill ?? b.fill,
    stroke: slot?.stroke ?? b.stroke,
    'stroke-width': b.strokeWidth,
    ...shape,
  };
  w.outline('node', 'rect', {
    class: 'basic label-container outer-path',
    x: left,
    y: top,
    width: view.width,
    height: view.height,
    filter: b.shadow,
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
  if (view.divider !== undefined) drawDivider(w, view, outline, left, top);
  w.close();
}

/**
 * The rule between the name and the body. Under the gradient (D182) it is drawn in one path
 * with the outline, so its box is the box's and the objectBoundingBox gradient paints it
 * (D185, as ER's rules); elsewhere it is the line alone.
 */
function drawDivider(w: SvgWriter, view: BoxView, outline: Attrs, left: number, top: number): void {
  const right = left + view.width;
  const y = top + view.divider!;
  const b = w.path();
  if (String(outline.stroke).startsWith('url(')) {
    b.moveTo(left, top)
      .lineTo(right, top)
      .lineTo(right, top + view.height)
      .lineTo(left, top + view.height)
      .close();
  }
  b.moveTo(left, y).lineTo(right, y);
  w.open('g', { class: 'divider' });
  w.outline('divider', 'path', {
    d: b.done(),
    fill: 'none',
    stroke: outline.stroke,
    'stroke-width': outline['stroke-width'],
    'stroke-dasharray': outline['stroke-dasharray'],
    'stroke-opacity': outline['stroke-opacity'],
    opacity: outline.opacity,
  });
  w.close();
}
