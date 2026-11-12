// Draws a laid-out state diagram through the SvgWriter (DESIGN §7). Structure follows v12's
// group classes (`clusters`, `edgePaths`, `edgeLabels`, `nodes`) and state class names
// (`statediagram-state`, `statediagram-cluster`, `statediagram-note`, `transition`,
// `note-edge`); every state, composite, region, transition and note is one element with
// `data-id` and `data-ast` (R-SVG-2, -3, R-PARSE-8). Sizes and colours come from theme
// variables only, never a theme name or a look (R-THEME-11, D152; checked by conformance
// `state/render-theme-names.spec.ts`).
import { pxProfile } from '@mermaid-js/core/layout';
import { arrowheads, marker, markerTrim, type Arrowheads } from '@mermaid-js/shared/svg/arrowheads';
import { edgeLabel as labelOnBox } from '@mermaid-js/shared/svg/graph';
import { routePath } from '@mermaid-js/shared/svg/route';
import {
  checkLinkTarget,
  checkUrl,
  cls,
  openSvgRoot,
  textElement,
  translate,
  type Attrs,
  type OutlinePaint,
  type Paint,
  type SafeValue,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import type {
  StateEdgeView,
  StateGroupView,
  StateLayout,
  StateMetrics,
  StateNodeView,
  StatePrepared,
  StateRenderContext,
  StateWarning,
} from '../layout/index.ts';
import { stateMetrics } from '../layout/index.ts';
import { completeLayout, type CompleteStateLayout } from '../layout/layout.ts';
import type { StateLink, StateModel } from '../parser/index.ts';
import { drawFolded } from '@mermaid-js/core/svg/folded';
import { drawFramed } from '@mermaid-js/core/svg/framed';
import { drawDescribed, drawShape, type ShapePaint } from './shapes.ts';

// v12 `.note-edge { stroke-dasharray: 5 }` and `.statediagram-state rect.divider
// { stroke-dasharray: 10,10 }`: the same in every look, so constants (D152).
const NOTE_DASH = '5' as SafeValue;
const DIVIDER_DASH = '10 10' as SafeValue;
// Room either side of a transition label on its background.

type ThemeOf = StateRenderContext['theme'];
type Color = ReturnType<ThemeOf['color']>;
type Length = ReturnType<ThemeOf['length']>;

interface Tint {
  readonly id: `color-${number}`;
  readonly stroke: Paint;
  readonly fill?: Paint;
}

/** Every theme variable the body uses, looked up before the root is written (rootStyle). */
interface Paints {
  readonly head: Arrowheads;
  readonly font: ReturnType<ThemeOf['font']>;
  readonly fontSize: Length;
  readonly strokeWidth: Length;
  /** State boxes, diamonds, rings and the end state's dot. */
  readonly fill: Color;
  /** Outlines: the theme's gradient when `useGradient` is on (D182), else nodeBorder. */
  readonly border: OutlinePaint;
  /**
   * nodeBorder as a colour: the end state's dot fill and the dividers, which are lines with a
   * zero-width or zero-height box that a bounding-box gradient leaves unpainted.
   */
  readonly plainBorder: Color;
  readonly text: Color;
  /** Transitions, their arrowheads and the filled pseudo-states' fill. */
  readonly line: Color;
  /** The start dot's, fork and join bars' and end ring's stroke: lineColor or the gradient. */
  readonly lineOutline: OutlinePaint;
  readonly arrow: Color;
  /** The theme's drop shadow on outlines; none for a theme whose value is `none`. */
  readonly shadow: ReturnType<ThemeOf['filter']> | undefined;
  readonly composite?: {
    readonly title: Color;
    readonly body: Color;
    readonly alt: Color;
    readonly text: Color;
    readonly radius: number;
  };
  readonly note?: { fill: Color; stroke: OutlinePaint; text: Color };
  /** Folded blocks (#670): the icon's filled nodes and the type's muted grey. */
  readonly folded?: { readonly ink: Color; readonly muted: Color };
  readonly edgeLabel?: { fill: Color; text: Color };
  /** The palette slot of each composite and region; empty when the theme has no palette. */
  readonly slots: ReadonlyMap<string, Tint>;
}

/**
 * Per-composite palette colour (v12 `colorSlotFor`, `state/styles.js` `genColor`). On only when
 * the theme carries a non-empty `borderColorArray`, never by theme name (D152). Each composite
 * takes the next slot in declaration order; a styled one (`class`, `:::`, `style`) spends its
 * slot but is not painted; its regions share its slot. The fill comes from `bkgColorArray`
 * only when that is not empty, so `redux-dark-color` colours borders only.
 */
function paletteSlots(theme: ThemeOf, model: StateModel, s: StatePrepared): Map<string, Tint> {
  const slots = new Map<string, Tint>();
  const border = theme.palette('borderColorArray');
  if (border.length === 0) return slots;
  const bkg = theme.palette('bkgColorArray');
  let next = 0;
  for (const st of model.states) {
    if (st.kind !== 'composite') continue;
    const order = next++;
    if (st.classes.length > 0 || st.styles.length > 0) continue;
    const slot = order % border.length;
    const tint: Tint = {
      id: `color-${slot}`,
      stroke: border[slot]!,
      fill: bkg.length > 0 ? bkg[order % bkg.length] : undefined,
    };
    slots.set(st.id, tint);
    for (const r of s.regions.get(st.id) ?? []) slots.set(r, tint);
  }
  return slots;
}

function paints(theme: ThemeOf, model: StateModel, s: StatePrepared): Paints {
  const node = {
    head: arrowheads(theme),
    font: theme.font(),
    fontSize: theme.length('fontSize'),
    strokeWidth: theme.length('strokeWidth'),
    fill: theme.color('mainBkg'),
    // v12 neo (`styles.ts` `[data-look=neo]` rules, `state/styles.js:318-327`) strokes these
    // with the gradient; lookups in the old order so other themes' roots are unchanged.
    border: theme.outline('nodeBorder'),
    plainBorder: theme.color('nodeBorder'),
    text: theme.color('nodeTextColor'),
    line: theme.color('lineColor'),
    lineOutline: theme.outline('lineColor'),
    arrow: theme.color('arrowheadColor'),
    shadow: theme.value('dropShadow') === 'none' ? undefined : theme.filter('dropShadow'),
  };
  // v12's composite variables (D120, D126, #193, #197): the title band, a top-level
  // composite's body and a nested composite's body.
  const composite =
    s.groups.length > 0
      ? {
          title: theme.color('compositeTitleBackground'),
          body: theme.color('compositeBackground'),
          alt: theme.color('altBackground'),
          text: theme.color('titleColor'),
          radius: theme.number('radius'),
        }
      : undefined;
  const note = s.nodes.some((v) => v.shape === 'note')
    ? {
        fill: theme.color('noteBkgColor'),
        stroke: theme.outline('noteBorderColor'),
        text: theme.color('noteTextColor'),
      }
    : undefined;
  const edgeLabel = s.edges.some((e) => e.label.width > 0)
    ? { fill: theme.color('edgeLabelBackground'), text: theme.color('textColor') }
    : undefined;
  // Read here, not in core, so the theme inventory lists the diagrams that use them.
  const folded = s.nodes.some((v) => v.block === 'folded')
    ? { ink: theme.color('nodeBorder'), muted: theme.color('mutedBorder') }
    : undefined;
  return { ...node, composite, note, folded, edgeLabel, slots: paletteSlots(theme, model, s) };
}

/** What every section of one render draws from. */
interface Scene {
  readonly w: SvgWriter;
  readonly layout: CompleteStateLayout;
  readonly s: StatePrepared;
  readonly sm: StateMetrics;
  readonly titlePad: number;
  readonly ctx: StateRenderContext;
  readonly paint: Paints;
  readonly warn: (warning: StateWarning) => void;
}

/** Writes the whole `<svg>` document for a laid-out state diagram. */
export function renderState(
  model: StateModel,
  layout: StateLayout,
  ctx: StateRenderContext,
  w: SvgWriter
): void {
  // A postLayout hook that builds a new model drops the views and dividers (see StateLayout).
  const full = completeLayout(model, layout, ctx);
  const s = full.state;
  const units = ctx.units ?? pxProfile;
  const scene: Scene = {
    w,
    layout: full,
    s,
    sm: stateMetrics(units),
    titlePad: units.builder.titlePad,
    ctx,
    paint: paints(ctx.theme, model, s),
    warn: (warning) => ctx.warn(warning),
  };
  openRoot(scene, model);
  drawClusters(scene);
  w.open('g', {
    class: 'edgePaths',
    fill: 'none',
    stroke: scene.paint.line,
    'stroke-width': scene.paint.strokeWidth,
    'stroke-linecap': 'round',
  });
  for (const e of s.edges) drawEdge(scene, e);
  w.close();
  w.open('g', { class: 'edgeLabels' });
  if (scene.paint.edgeLabel) for (const e of s.edges) drawEdgeLabel(scene, e);
  w.close();
  const links = new Map<string, StateLink>();
  for (const l of model.links) links.set(l.id, l);
  w.open('g', { class: 'nodes', fill: scene.paint.text });
  for (const view of s.nodes) drawNode(scene, view, view.state && links.get(view.state.id));
  w.close();
  w.close();
}

/** The `<svg>` root with its title and description (R-A11Y-1). */
function openRoot({ w, layout, ctx, paint }: Scene, model: StateModel): void {
  const { config } = ctx;
  const width = Math.max(1, Math.ceil(layout.width));
  const height = Math.max(1, Math.ceil(layout.height));
  const maxWidth = config.state?.useMaxWidth !== false;
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  openSvgRoot(w, ctx, {
    name: 'state statediagram',
    roleDescription: 'stateDiagram',
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

/** Composites and their regions, outermost first, then the dividers between regions. */
function drawClusters(scene: Scene): void {
  const { w, s } = scene;
  w.open('g', { class: 'clusters' });
  for (const g of s.groups) {
    if (g.region) drawRegion(scene, g);
    else drawComposite(scene, g);
  }
  w.close();
}

/**
 * A composite as v12 `roundedWithTitle` drew it: an outer rounded rect whose top shows as the
 * title band, and an inner rect for the body below the title. A composite nested in an odd
 * number of scopes is `statediagram-cluster-alt`, with the alternate body fill.
 */
function drawComposite({ w, layout, ctx, paint, titlePad }: Scene, g: StateGroupView): void {
  const box = layout.groups.get(g.id);
  const c = paint.composite!;
  if (!box) return;
  const slot = paint.slots.get(g.id);
  const alt = g.depth % 2 === 1;
  const left = box.x - box.width / 2;
  const top = box.y - box.height / 2;
  const bottom = top + box.height;
  // The body starts halfway between the title and the content below it.
  const band = Math.min(bottom, box.title.y + g.label.height / 2 + titlePad / 4);
  w.open('g', {
    class:
      'statediagram-state statediagram-cluster' +
      (alt ? ' statediagram-cluster-alt' : '') +
      cls(g.state?.classes ?? []),
    'data-id': g.id,
    'data-ast': g.ast,
    'data-color-id': slot?.id,
  });
  const stroke = slot?.stroke ?? paint.border;
  // The author's `style` / `classDef` still wins over the palette (spread after). The title
  // band and the body are the composite's two `part`s (D302).
  w.outline('part', 'rect', {
    class: 'outer',
    x: left,
    y: top,
    width: box.width,
    height: box.height,
    rx: c.radius,
    fill: slot?.fill ?? c.title,
    stroke,
    'stroke-width': paint.strokeWidth,
    filter: paint.shadow,
    ...g.style.shape,
  });
  w.outline('part', 'rect', {
    class: 'inner',
    x: left,
    y: band,
    width: box.width,
    height: bottom - band,
    fill: alt ? c.alt : c.body,
    stroke,
    'stroke-width': paint.strokeWidth,
    ...g.style.shape,
  });
  const fill = g.style.shape.fill;
  w.label(g.label, box.title.x, box.title.y, {
    class: 'cluster-label',
    fill: (fill && ctx.theme.ink(fill)) || c.text,
    ...g.style.text,
  });
  // A divider is a line: its box has no width or height, so it takes the colour, not the
  // gradient (v12 neo dashes the whole region rect with the gradient instead).
  const divider = slot?.stroke ?? paint.plainBorder;
  for (const d of layout.dividers) {
    if (d.composite !== g.id) continue;
    w.outline('divider', 'line', {
      class: 'divider',
      x1: d.x1,
      y1: d.y1,
      x2: d.x2,
      y2: d.y2,
      stroke: divider,
      'stroke-width': paint.strokeWidth,
      'stroke-dasharray': DIVIDER_DASH,
    });
  }
  w.close();
}

/**
 * A concurrency region: its frame, with no border and no fill (the dividers separate regions, and
 * the composite's body shows through). It carries its composite's palette slot.
 */
function drawRegion({ w, layout, paint }: Scene, g: StateGroupView): void {
  const box = layout.groups.get(g.id);
  if (!box) return;
  const slot = paint.slots.get(g.id);
  w.open('g', {
    class: 'statediagram-state statediagram-cluster statediagram-region',
    'data-id': g.id,
    'data-ast': g.ast,
    'data-color-id': slot?.id,
  });
  w.outline('group', 'rect', {
    class: 'region',
    x: box.x - box.width / 2,
    y: box.y - box.height / 2,
    width: box.width,
    height: box.height,
    fill: 'none',
    stroke: 'none',
  });
  w.close();
}

/**
 * A transition: its path and a point arrowhead. A note's connector is dashed, with no
 * arrowhead and no `data-ast` (the note element carries the note's AST id, R-PARSE-8).
 */
function drawEdge({ w, layout, paint }: Scene, e: StateEdgeView): void {
  const route = layout.edges.get(e.id);
  w.open('g', {
    class: e.note
      ? 'transition note-edge edge-thickness-normal edge-pattern-dashed'
      : 'transition edge-thickness-normal edge-pattern-solid',
    'data-id': e.id,
    'data-ast': e.note ? undefined : e.ast,
  });
  if (route && route.points.length > 1) {
    const path = routePath(
      w,
      route.points,
      e.source === e.target ? 'rounded' : 'curved',
      0,
      e.note ? 0 : markerTrim('arrow_point', paint.head)
    );
    // Paint comes from the `edgePaths` group (stroke, width, no fill).
    w.outline('edge', 'path', {
      d: path.d,
      'stroke-dasharray': e.note ? NOTE_DASH : undefined,
      'stroke-linecap': e.note ? 'butt' : undefined,
    });
    if (!e.note) {
      const end = { x: path.ex, y: path.ey, dx: path.edx, dy: path.edy };
      marker(w, 'arrow_point', end, { fill: paint.arrow }, paint.head);
    }
  }
  w.close();
}

function drawEdgeLabel({ w, layout, paint }: Scene, e: StateEdgeView): void {
  const at = layout.edges.get(e.id)?.label;
  if (!at || e.label.width === 0) return;
  const { fill, text } = paint.edgeLabel!;
  labelOnBox(w, e.label, at, e.id, { fill, text: { fill: text }, rx: 3 });
}

function nodeClass(view: StateNodeView): string {
  if (view.shape === 'note') return 'node statediagram-note';
  // v12 `stateStart` and `stateEnd` wrote `node default` and no state classes.
  if (view.shape === 'start' || view.shape === 'end') return 'node default';
  if (view.block)
    return (
      (view.block === 'folded' ? 'node embed folded' : 'node embed') +
      cls(view.state?.classes ?? [])
    );
  return 'node statediagram-state' + cls(view.state?.classes ?? []);
}

/** A block is one image to assistive technology, named by its title (ADR-15). */
function blockAria(view: StateNodeView): Attrs {
  if (!view.block) return {};
  return { role: 'img', 'aria-label': view.state?.title || view.id };
}

function drawNode(scene: Scene, view: StateNodeView, link: StateLink | undefined): void {
  const { w, layout, ctx, paint, warn } = scene;
  const box = layout.nodes.get(view.id);
  if (!box) return;
  w.open('g', {
    class: nodeClass(view),
    'data-id': view.id,
    'data-ast': view.ast,
    transform: translate(box.x, box.y),
    ...blockAria(view),
  });
  if (link?.tooltip) textElement(w, 'title', link.tooltip);
  const href = link
    ? checkUrl(link.url, {
        securityLevel: ctx.securityLevel ?? 'default',
        linkSchemes: ctx.linkSchemes,
        warn,
      })
    : undefined;
  // v12 opened every state link in a new window.
  if (href) w.open('a', { href, target: checkLinkTarget('_blank', warn) });
  if (view.block) {
    // A border and a transparent background, which set a block apart from a composite.
    const frame: Attrs = {
      fill: 'none',
      stroke: paint.border,
      'stroke-width': paint.strokeWidth,
      ...view.style.shape,
    };
    const size = { width: view.w, height: view.h };
    if (view.block === 'folded') {
      const fold = view.fold!;
      const marks = { frame, mark: frame.stroke ?? paint.border, ...paint.folded! };
      drawFolded(w, size, view.label, fold.label, fold.type.length, {
        ...marks,
        title: view.style.text,
      });
    } else {
      const y = drawFramed(w, size, view.label.height, view.embed ?? null, frame);
      if (view.label.height > 0) w.label(view.label, 0, y, view.style.text);
    }
  } else drawState(scene, view);
  if (href) w.close();
  w.close();
}

/** A state's, pseudo-state's or note's shape and label. */
function drawState({ w, sm, ctx, paint }: Scene, view: StateNodeView): void {
  const note = view.shape === 'note' ? paint.note : undefined;
  const shape: Attrs = {
    fill: note?.fill ?? paint.fill,
    stroke: note?.stroke ?? paint.border,
    'stroke-width': paint.strokeWidth,
    filter: view.shape === 'fork' || view.shape === 'join' ? undefined : paint.shadow,
    ...view.style.shape,
  };
  const solid: Attrs = { fill: paint.line, stroke: paint.lineOutline, ...view.style.shape };
  const shapePaint: ShapePaint = {
    shape,
    solid,
    ring: solid.fill === paint.line ? paint.lineOutline : solid.fill,
    line: {
      stroke: shape.stroke === paint.border ? paint.plainBorder : shape.stroke,
      'stroke-width': shape['stroke-width'],
    },
  };
  drawShape(w, view, shapePaint);
  const fill = view.style.shape.fill;
  const text: Attrs = {
    fill: fill ? ctx.theme.ink(fill) : note?.text,
    ...view.style.text,
  };
  if (view.shape === 'described') drawDescribed(w, view, sm, shapePaint, text);
  else w.label(view.label, 0, 0, text);
}
