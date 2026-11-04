// Draws a laid-out state diagram through the SvgWriter (DESIGN §7). Structure follows v12's
// group classes (`clusters`, `edgePaths`, `edgeLabels`, `nodes`) and state class names
// (`statediagram-state`, `statediagram-cluster`, `statediagram-note`, `transition`,
// `note-edge`); every state, composite, region, transition and note is one element with
// `data-id` and `data-ast` (R-SVG-2, -3, R-PARSE-8). Sizes and colours come from theme
// variables only, never a theme name or a look (R-THEME-11, D152; checked by conformance
// `state/render-theme-names.spec.ts`).
import { pxProfile } from '@mermaid-js/core/layout';
import {
  checkLinkTarget,
  checkUrl,
  px,
  styleScope,
  styleText,
  themeStyleSheet,
  translate,
  type Attrs,
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
import { arrowTrim, arrowhead, drawArrowhead, routePath, type Arrowhead } from './edges.ts';
import { drawDescribed, drawShape, type ShapePaint } from './shapes.ts';

// v12 `.note-edge { stroke-dasharray: 5 }` and `.statediagram-state rect.divider
// { stroke-dasharray: 10,10 }`: the same in every look, so constants (D152).
const NOTE_DASH = '5' as SafeValue;
const DIVIDER_DASH = '10 10' as SafeValue;
// Room either side of a transition label on its background.
const LABEL_PAD = 4;
const LABEL_RADIUS = 3;

const cls = (names: readonly string[]): string => {
  let out = '';
  for (const n of names) {
    const c = n.replace(/[^\w-]/g, '');
    if (c) out += ' ' + c;
  }
  return out;
};

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
  readonly head: Arrowhead;
  readonly font: ReturnType<ThemeOf['font']>;
  readonly fontSize: Length;
  readonly strokeWidth: Length;
  /** State boxes, diamonds, rings and the end state's dot. */
  readonly fill: Color;
  readonly border: Color;
  readonly text: Color;
  /** Transitions, their arrowheads and the filled pseudo-states. */
  readonly line: Color;
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
  readonly note?: { fill: Color; stroke: Color; text: Color };
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
    head: arrowhead(theme),
    font: theme.font(),
    fontSize: theme.length('fontSize'),
    strokeWidth: theme.length('strokeWidth'),
    fill: theme.color('mainBkg'),
    border: theme.color('nodeBorder'),
    text: theme.color('nodeTextColor'),
    line: theme.color('lineColor'),
    arrow: theme.color('arrowheadColor'),
    shadow: theme.value('dropShadow') === 'none' ? undefined : theme.filter('dropShadow'),
  };
  // v12's `compositeTitleBackground` and `altBackground` are not core variables yet; their
  // redux values are `clusterBkg`'s (GAPS.md #146). The body is v12's `compositeBackground`.
  const composite =
    s.groups.length > 0
      ? {
          title: theme.color('clusterBkg'),
          body: theme.color('background'),
          alt: theme.color('clusterBkg'),
          text: theme.color('titleColor'),
          radius: theme.number('radius'),
        }
      : undefined;
  const note = s.nodes.some((v) => v.shape === 'note')
    ? {
        fill: theme.color('noteBkgColor'),
        stroke: theme.color('noteBorderColor'),
        text: theme.color('noteTextColor'),
      }
    : undefined;
  const edgeLabel = s.edges.some((e) => e.label.width > 0)
    ? { fill: theme.color('edgeLabelBackground'), text: theme.color('textColor') }
    : undefined;
  return { ...node, composite, note, edgeLabel, slots: paletteSlots(theme, model, s) };
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
  const { theme, config } = ctx;
  const prefix = (): string => ctx.idPrefix ?? 'mermaid';
  const width = Math.max(1, Math.ceil(layout.width));
  const height = Math.max(1, Math.ceil(layout.height));
  const maxWidth = config.state?.useMaxWidth !== false;
  const auto = theme.autoDeclarations();
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-state statediagram',
    viewBox: [0, 0, width, height],
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : height,
    role: 'img',
    'aria-roledescription': 'stateDiagram',
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

function textElement(w: SvgWriter, tag: 'title' | 'desc', text: string, id?: string): void {
  w.open(tag, id === undefined ? undefined : { id });
  w.text(text);
  w.close();
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
  // The author's `style` / `classDef` still wins over the palette (spread after).
  w.leaf('rect', {
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
  w.leaf('rect', {
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
  for (const d of layout.dividers) {
    if (d.composite !== g.id) continue;
    w.leaf('line', {
      class: 'divider',
      x1: d.x1,
      y1: d.y1,
      x2: d.x2,
      y2: d.y2,
      stroke,
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
  w.leaf('rect', {
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
      e.note ? 0 : arrowTrim(paint.head)
    );
    w.leaf('path', {
      d: path.d,
      'stroke-dasharray': e.note ? NOTE_DASH : undefined,
      'stroke-linecap': e.note ? 'butt' : undefined,
    });
    if (!e.note) drawArrowhead(w, path, { fill: paint.arrow }, paint.head);
  }
  w.close();
}

function drawEdgeLabel({ w, layout, paint }: Scene, e: StateEdgeView): void {
  const at = layout.edges.get(e.id)?.label;
  if (!at || e.label.width === 0) return;
  const lw = e.label.width + 2 * LABEL_PAD;
  w.open('g', { class: 'edgeLabel', 'data-id': e.id });
  w.leaf('rect', {
    x: at.x - lw / 2,
    y: at.y - e.label.height / 2,
    width: lw,
    height: e.label.height,
    rx: LABEL_RADIUS,
    fill: paint.edgeLabel!.fill,
  });
  w.label(e.label, at.x, at.y, { fill: paint.edgeLabel!.text });
  w.close();
}

function nodeClass(view: StateNodeView): string {
  if (view.shape === 'note') return 'node statediagram-note';
  // v12 `stateStart` and `stateEnd` wrote `node default` and no state classes.
  if (view.shape === 'start' || view.shape === 'end') return 'node default';
  return 'node statediagram-state' + cls(view.state?.classes ?? []);
}

function drawNode(
  { w, layout, sm, ctx, paint, warn }: Scene,
  view: StateNodeView,
  link: StateLink | undefined
): void {
  const box = layout.nodes.get(view.id);
  if (!box) return;
  w.open('g', {
    class: nodeClass(view),
    'data-id': view.id,
    'data-ast': view.ast,
    transform: translate(box.x, box.y),
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
  const note = view.shape === 'note' ? paint.note : undefined;
  const shape: Attrs = {
    fill: note?.fill ?? paint.fill,
    stroke: note?.stroke ?? paint.border,
    'stroke-width': paint.strokeWidth,
    filter: view.shape === 'fork' || view.shape === 'join' ? undefined : paint.shadow,
    ...view.style.shape,
  };
  const solid: Attrs = { fill: paint.line, stroke: paint.line, ...view.style.shape };
  const shapePaint: ShapePaint = {
    shape,
    solid,
    line: { stroke: shape.stroke, 'stroke-width': shape['stroke-width'] },
  };
  drawShape(w, view, shapePaint);
  const fill = view.style.shape.fill;
  const text: Attrs = {
    fill: fill ? ctx.theme.ink(fill) : note?.text,
    ...view.style.text,
  };
  if (view.shape === 'described') drawDescribed(w, view, sm, shapePaint, text);
  else w.label(view.label, 0, 0, text);
  if (href) w.close();
  w.close();
}
