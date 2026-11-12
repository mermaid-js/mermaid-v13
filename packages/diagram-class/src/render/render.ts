// Draws a laid-out class diagram through the SvgWriter (DESIGN §7, spec #126 T4). The structure
// follows v12's group classes (`clusters`, `edgePaths`, `edgeLabels`, `nodes`) as the flowchart
// renderer does; every class, member, relationship, namespace, note and interface drawn from
// the AST is one element with `data-id` and `data-ast` (R-SVG-2, -3, R-PARSE-8). What the
// boxes hold and where is `ClassLayout.class` (#155); this file only paints it.
import type { LayoutModelNode } from '@mermaid-js/core/layout';
import {
  checkLinkTarget,
  checkStyle,
  checkUrl,
  translate,
  type Attrs,
  type CheckedStyle,
  type OutlinePaint,
  type Paint,
  type SafeValue,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import { cls, openSvgRoot, paletteSlots, textElement } from '@mermaid-js/shared/svg/document';
import { edgeLabel as labelOnBox } from '@mermaid-js/shared/svg/graph';
import { routePath } from '@mermaid-js/shared/svg/route';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type {
  ClassBoxView,
  ClassEdgeView,
  ClassLayout,
  ClassPrepared,
  ClassRow,
  InterfaceView,
  NoteView,
} from '../layout/index.ts';
import { prepareClass } from '../layout/index.ts';
import type { ClassModel, ClassNode } from '../parser/index.ts';
import type { ClassRenderContext } from './context.ts';
import { marker, markers, markerTrim, type Markers } from './markers.ts';

// v12's dash patterns: `.edge-pattern-dashed` (relationships written `..`) and
// `.edge-pattern-dotted` (note edges).
const DASHED = '3' as SafeValue;
const DOTTED = '2' as SafeValue;
const DASH: Readonly<Record<string, SafeValue | undefined>> = { dashed: DASHED, dotted: DOTTED };
/** Room on each side of a relationship label's background (as the flowchart's). */

type ThemeOf = ClassRenderContext['theme'];
type Color = ReturnType<ThemeOf['color']>;
type Length = ReturnType<ThemeOf['length']>;

interface Tint {
  readonly id: `color-${number}`;
  readonly stroke: Paint;
  readonly fill?: Paint;
}

/** Every theme variable the body uses, looked up before the root is written. */
interface Paints {
  readonly font: ReturnType<ThemeOf['font']>;
  readonly fontSize: Length;
  /** `stroke` is the theme's gradient when `useGradient` is on (D182, v12 neo `classBox.ts`). */
  readonly box: { fill: Color; stroke: OutlinePaint; text: Color };
  /**
   * How far a divider's end is lifted: 0.01 when it is drawn with the gradient, else 0. A level
   * line has a zero-height box, which an objectBoundingBox gradient doesn't paint; v12 lifts it
   * by 0.001, the writer's precision is 0.01.
   */
  readonly lift: number;
  readonly strokeWidth: Length;
  /**
   * The theme's drop shadow, on class boxes, notes and namespaces only (v12 neo's `.outer-path`
   * and `.cluster rect`); `none` in the classic themes writes no filter.
   */
  readonly shadow: ReturnType<ThemeOf['filter']> | undefined;
  readonly line: Color;
  readonly markers: Markers;
  readonly note?: { fill: Color; stroke: Color; text: Color };
  readonly cluster?: { fill: Color; stroke: OutlinePaint; strokeWidth: Length; text: Color };
  /** Relationship labels and multiplicities, and the interface names. */
  readonly text?: Color;
  readonly edgeLabel?: Color;
  /** Multiplicities' font size (`classTerminalFontSize`, v12 11px). */
  readonly terminalSize?: Length;
  readonly slotOf: (order: number) => Tint | undefined;
}

function paints(theme: ThemeOf, p: ClassPrepared): Paints {
  const strokeWidth = theme.length('strokeWidth');
  const line = theme.color('lineColor');
  const box = {
    fill: theme.color('mainBkg'),
    // v12 neo strokes class boxes and their dividers with the gradient; notes keep
    // noteBorderColor (v12 `note.ts` writes it as an inline `!important` style).
    stroke: theme.outline('nodeBorder'),
    // v12 `classText`: every class-diagram text but notes and namespace titles.
    text: theme.color('classText'),
  };
  const shadow = theme.value('dropShadow') === 'none' ? undefined : theme.filter('dropShadow');
  const note =
    p.notes.length > 0
      ? {
          fill: theme.color('noteBkgColor'),
          stroke: theme.color('noteBorderColor'),
          text: theme.color('noteTextColor'),
        }
      : undefined;
  const cluster =
    p.groups.length > 0
      ? {
          fill: theme.color('clusterBkg'),
          stroke: theme.outline('clusterBorder'),
          strokeWidth: theme.length('clusterStrokeWidth'),
          text: theme.color('titleColor'),
        }
      : undefined;
  const labelled = p.edges.some((e) => e.label);
  const text =
    labelled || p.interfaces.length > 0 || p.edges.some((e) => e.startLabel ?? e.endLabel)
      ? box.text
      : undefined;
  const terminalSize = p.edges.some((e) => e.startLabel ?? e.endLabel)
    ? theme.length('classTerminalFontSize')
    : undefined;
  const edgeLabel = labelled ? theme.color('mainBkg') : undefined;
  return {
    font: theme.font(),
    fontSize: theme.length('fontSize'),
    box,
    lift: theme.gradient() ? 0.01 : 0,
    strokeWidth,
    shadow,
    line,
    markers: markers(theme, line, box.fill),
    note,
    cluster,
    text,
    edgeLabel,
    terminalSize,
    slotOf: paletteSlots(theme),
  };
}

/** What every section of one render draws from. */
interface Scene {
  readonly w: SvgWriter;
  readonly layout: ClassLayout;
  readonly p: ClassPrepared;
  readonly ctx: ClassRenderContext;
  readonly paint: Paints;
}

/** Writes the whole `<svg>` document for a laid-out class diagram. */
export function renderClass(
  model: ClassModel,
  layout: ClassLayout,
  ctx: ClassRenderContext,
  w: SvgWriter
): void {
  const p = layout.class ?? prepareClass(model, ctx);
  const scene: Scene = { w, layout, p, ctx, paint: paints(ctx.theme, p) };
  openRoot(scene, model);
  if (scene.paint.cluster) drawNamespaces(scene);
  // One `data-id` per relationship, on its line, its label and its multiplicities.
  const idOf = edgeIds(model);
  drawEdges(scene, idOf);
  w.open('g', { class: 'edgeLabels' });
  for (const e of p.edges) drawEdgeLabels(scene, e, idOf(e));
  w.close();
  w.open('g', { class: 'nodes', fill: scene.paint.box.text });
  const styles = styleCache(model, ctx);
  p.boxes.forEach((view, order) => drawClass(scene, view, order, styles(view.node)));
  for (const view of p.notes) drawNote(scene, view);
  for (const view of p.interfaces) drawInterface(scene, view);
  w.close();
  w.close();
}

/** The `<svg>` root with its title and description (R-A11Y-1). */
function openRoot({ w, layout, ctx, paint }: Scene, model: ClassModel): void {
  const { config } = ctx;
  const width = Math.max(1, Math.ceil(layout.width));
  const height = Math.max(1, Math.ceil(layout.height));
  const maxWidth = config.class?.useMaxWidth !== false;
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  openSvgRoot(w, ctx, {
    name: 'class',
    roleDescription: 'classDiagram',
    viewBox: [0, 0, width, height],
    maxWidth,
    title,
    desc,
    attrs: {
      'font-family': paint.font,
      'font-size': paint.fontSize,
    },
  });
}

/**
 * The checked style of a class, in v12's order: the `classDef`s of its CSS classes (v12's
 * generated `.name > *` rules), then its inline `style` (the model's `styles`, which already
 * holds the `classDef`s v12's `defineClass` copied in). A declaration is checked once: one
 * already inline is not repeated from the class rules, and the inline one wins as in v12.
 */
function styleCache(model: ClassModel, ctx: ClassRenderContext): (node: ClassNode) => CheckedStyle {
  const defs = new Map<string, readonly string[]>();
  for (const sc of model.styleClasses) defs.set(sc.id, sc.styles);
  const seen = new Map<string, CheckedStyle>();
  return (node) => {
    const inline = new Set(node.styles.map((d) => d.trim()));
    const decls: string[] = [];
    const taken = new Set<string>();
    for (const c of node.classes) {
      for (const s of defs.get(c) ?? []) {
        for (const d of s.split(',')) {
          const k = d.trim();
          if (inline.has(k) || taken.has(k)) continue;
          taken.add(k);
          decls.push(d);
        }
      }
    }
    decls.push(...node.styles);
    const key = decls.join(';');
    let style = seen.get(key);
    if (!style) seen.set(key, (style = checkStyle(decls, (w) => ctx.warn(w))));
    return style;
  };
}

/** The box a node was placed in, top-left corner first. */
function placed(box: LayoutModelNode): { x: number; y: number } {
  return { x: box.x - box.width / 2, y: box.y - box.height / 2 };
}

function drawNamespaces({ w, layout, p, paint }: Scene): void {
  const cluster = paint.cluster!;
  w.open('g', { class: 'clusters' });
  for (const g of p.groups) {
    const box = layout.groups.get(g.layoutId);
    if (!box) continue;
    w.open('g', { class: 'cluster namespace', 'data-id': g.id, 'data-ast': g.ast });
    w.outline('group', 'rect', {
      x: box.x - box.width / 2,
      y: box.y - box.height / 2,
      width: box.width,
      height: box.height,
      fill: cluster.fill,
      stroke: cluster.stroke,
      'stroke-width': cluster.strokeWidth,
      filter: paint.shadow,
    });
    w.label(g.label, box.title.x, box.title.y, { class: 'cluster-label', fill: cluster.text });
    w.close();
  }
  w.close();
}

/** v12's edge ids: `id_<from>_<to>_<n>` for the n-th relationship, `edgeNote<k>` for notes. */
function edgeIds(model: ClassModel): (e: ClassEdgeView) => string {
  const index = new Map(model.relations.map((r, i) => [r, i + 1]));
  return (e) =>
    e.relation
      ? `id_${e.relation.start.id}_${e.relation.end.id}_${index.get(e.relation) ?? 0}`
      : `edgeNote${e.note!.id.replace(/^note/, '')}`;
}

function drawEdges(scene: Scene, idOf: (e: ClassEdgeView) => string): void {
  const { w, layout, p, paint } = scene;
  w.open('g', {
    class: 'edgePaths',
    fill: 'none',
    stroke: paint.line,
    'stroke-width': paint.strokeWidth,
    'stroke-linecap': 'round',
  });
  for (const e of p.edges) {
    const route = layout.edges.get(e.layoutId);
    const pattern = e.kind === 'note' ? 'dotted' : e.line;
    w.open('g', {
      class: `edge relation edge-thickness-normal edge-pattern-${pattern}${
        e.kind === 'lollipop' ? ' lollipop' : ''
      }`,
      'data-id': idOf(e),
      // A note's AST node is drawn by its box; a relationship's, by its edge.
      'data-ast': e.kind === 'note' ? undefined : e.ast,
    });
    if (route && route.points.length > 1) {
      const path = routePath(
        w,
        route.points,
        e.source === e.target ? 'rounded' : p.curve,
        markerTrim(e.startMarker, paint.markers),
        markerTrim(e.endMarker, paint.markers)
      );
      // Paint comes from the `edgePaths` group (stroke, width, no fill).
      w.outline('edge', 'path', {
        d: path.d,
        'stroke-dasharray': DASH[pattern],
        // v12 drew patterned edges with butt caps; round caps would close the dashes' gaps.
        'stroke-linecap': pattern === 'solid' ? undefined : 'butt',
      });
      marker(
        w,
        e.startMarker,
        { x: path.sx, y: path.sy, dx: path.sdx, dy: path.sdy },
        paint.markers
      );
      marker(w, e.endMarker, { x: path.ex, y: path.ey, dx: path.edx, dy: path.edy }, paint.markers);
    }
    w.close();
  }
  w.close();
}

function drawEdgeLabels({ w, layout, paint }: Scene, e: ClassEdgeView, id: string): void {
  const at = layout.edges.get(e.layoutId);
  if (!at) return;
  if (e.label && at.label && paint.edgeLabel)
    labelOnBox(w, e.label, at.label, id, {
      fill: paint.edgeLabel,
      text: { fill: paint.text },
      rx: 3,
    });
  const ends: [MeasuredLabel | undefined, { x: number; y: number } | undefined][] = [
    [e.startLabel, at.startLabel],
    [e.endLabel, at.endLabel],
  ];
  if (!ends.some(([l, p]) => l && p)) return;
  w.open('g', {
    class: 'edgeTerminals',
    'data-id': id,
    fill: paint.text,
    'font-size': paint.terminalSize,
  });
  for (const [label, p] of ends) if (label && p) w.label(label, p.x, p.y);
  w.close();
}

/** A row's label, drawn from the box's top-left corner (`ClassRow` x/y). */
function drawRow(w: SvgWriter, row: ClassRow, attrs: Attrs): void {
  const label = row.label;
  const cy = row.y + label.height / 2;
  if (row.anchor === 'middle') {
    w.label(label, row.x, cy, attrs);
    return;
  }
  if (label.lines.length === 0) {
    w.leaf('text', attrs);
    return;
  }
  // Left-aligned: centred on its own width, so the writer's left mode starts it at `x`.
  w.label({ ...label, left: true }, row.x + label.width / 2, cy, attrs);
}

function drawClass(
  { w, layout, ctx, paint }: Scene,
  view: ClassBoxView,
  order: number,
  style: CheckedStyle
): void {
  const box = layout.nodes.get(view.layoutId);
  if (!box) return;
  const node = view.node;
  const slot = paint.slotOf(order);
  const at = placed(box);
  w.open('g', {
    class: 'node' + cls(node.classes),
    'data-id': view.id,
    'data-ast': view.ast,
    'data-color-id': slot?.id,
    transform: translate(at.x, at.y),
  });
  if (node.tooltip) textElement(w, 'title', node.tooltip);
  const warn = ctx.warn.bind(ctx);
  const href =
    node.link === undefined
      ? undefined
      : checkUrl(node.link, {
          securityLevel: ctx.securityLevel ?? 'default',
          linkSchemes: ctx.linkSchemes,
          warn,
        });
  if (href) w.open('a', { href, target: checkLinkTarget(node.linkTarget, warn) });
  // The author's `style` / `classDef` still wins over the palette (spread after).
  const shape: Attrs = {
    fill: slot?.fill ?? paint.box.fill,
    stroke: slot?.stroke ?? paint.box.stroke,
    'stroke-width': paint.strokeWidth,
    ...style.shape,
  };
  w.outline('node', 'rect', {
    class: 'outer-path',
    x: 0,
    y: 0,
    width: view.width,
    height: view.height,
    filter: paint.shadow,
    ...shape,
  });
  // The dividers take the box's stroke: the gradient too, as v12 under `useGradient` (no
  // `neo-line`), lifted so the gradient paints.
  const lift = shape.stroke === paint.box.stroke ? paint.lift : 0;
  for (const y of view.dividers) {
    w.outline('divider', 'path', {
      class: 'divider',
      d: w
        .path()
        .moveTo(0, y)
        .lineTo(view.width, y + lift)
        .done(),
      fill: 'none',
      stroke: shape.stroke,
      'stroke-width': shape['stroke-width'],
      'stroke-dasharray': shape['stroke-dasharray'],
      opacity: shape.opacity,
      'stroke-opacity': shape['stroke-opacity'],
    });
  }
  const fill = style.shape.fill;
  const text: Attrs = {
    fill: fill ? ctx.theme.ink(fill) : undefined,
    ...style.text,
  };
  if (view.annotation) drawRow(w, view.annotation, { class: 'annotation', ...text });
  drawRow(w, view.name, { class: 'title', ...text });
  for (const c of view.compartments) {
    for (const row of c.rows) {
      drawRow(w, row, {
        class: c.kind === 'methods' ? 'member method' : 'member attribute',
        // The raw class id plus `#k`, as the box's `data-id` (`data-ast` escapes the name).
        'data-id':
          row.ast === undefined
            ? undefined
            : `${view.id}${row.ast.slice(row.ast.lastIndexOf('#'))}`,
        'data-ast': row.ast,
        ...text,
      });
    }
  }
  if (href) w.close();
  w.close();
}

function drawNote({ w, layout, paint }: Scene, view: NoteView): void {
  const box = layout.nodes.get(view.layoutId);
  if (!box) return;
  const note = paint.note!;
  const at = placed(box);
  w.open('g', {
    class: 'node note',
    'data-id': view.id,
    'data-ast': view.ast,
    transform: translate(at.x, at.y),
  });
  w.outline('node', 'rect', {
    class: 'outer-path',
    x: 0,
    y: 0,
    width: view.width,
    height: view.height,
    fill: note.fill,
    stroke: note.stroke,
    'stroke-width': paint.strokeWidth,
    filter: paint.shadow,
  });
  // v12 drew note text left-aligned (`text-align: left`), the block centred in the box.
  w.label(
    view.label.lines.length > 1 ? { ...view.label, left: true } : view.label,
    view.width / 2,
    view.height / 2,
    { fill: note.text }
  );
  w.close();
}

function drawInterface({ w, layout, paint }: Scene, view: InterfaceView): void {
  const box = layout.nodes.get(view.layoutId);
  if (!box) return;
  // v12 drew the interface as a rect with `opacity: 0`: only its name shows.
  w.open('g', {
    class: 'node interface',
    'data-id': view.id,
    'data-ast': view.ast,
    transform: translate(box.x, box.y),
  });
  w.label(view.label, 0, 0, { fill: paint.text });
  w.close();
}
