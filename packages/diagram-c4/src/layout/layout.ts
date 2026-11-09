/**
 * The C4 custom layout (spec #522 §Layout, T3, `layoutKind: 'custom'`): `C4Model` in, `C4Layout`
 * out. Text is measured first, through the injected measurer in the fonts it is drawn in
 * (pitfall 16); then the grid (`./grid.ts`, D454) places elements and boundaries, the router
 * (`./route.ts`, D455) draws the relations in model order, and each relation's label goes along
 * its line where it covers least (Pele `render.ts` at commit 3a2f075, https://github.com/obsidianmd/pele,
 * MIT, (c) 2026 kepano). The title goes above, and the canvas is everything drawn (D224) with the
 * config margins all round.
 */
// cspell:ignore kepano
import type { RenderContext } from '@mermaid-js/core';
import { layoutLabel, Style, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import { C4_BOUNDARY_CYCLE } from '../codes.ts';
import { c4Fonts, c4LayoutConfig, type C4Fonts, type C4LayoutConfig } from '../config.ts';
import type { C4Element, C4Model, C4Relation } from '../model.ts';
import {
  brokenCycles,
  placeGrid,
  type GridGroup,
  type GridNode,
  type GridSpacing,
} from './grid.ts';
import { C4_METRICS as M, FONT_WEIGHT } from './metrics.ts';
import { Lanes, pointsOf, route, type Route } from './route.ts';
import { shapeOf, shapeSize, type Outline } from './shapes.ts';
import type {
  C4BoundaryLayout,
  C4ElementLayout,
  C4Layout,
  C4RelationLayout,
  C4ShapeId,
  PlacedLabel,
  Point,
  Rect,
} from './types.ts';

/** What the layout reads from the render context. */
export type C4LayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'inline' | 'warn'>>;

/** For a layout run without a `warn` sink (unit tests, the invariants). */
const ignoreWarning = (): void => undefined;

/** v12 `c4ShapeAdapter.ts` `STEREOTYPE_NAMES`. */
const STEREOTYPES: Readonly<Record<string, string>> = {
  person: 'Person',
  system: 'Software System',
  container: 'Container',
  component: 'Component',
};

/** v12's type line: `[Person]`, `[Software System]`, `[Container: techn]` (external, db and queue as their base). */
export function stereotypeText(element: Pick<C4Element, 'kind' | 'techn'>): string {
  const base = element.kind.replace(/^external_/, '').replace(/_(db|queue)$/, '');
  const name = STEREOTYPES[base] ?? base.replace(/_/g, ' ');
  return element.techn ? `[${name}: ${element.techn}]` : `[${name}]`;
}

/** A text measured, before it is placed. */
interface Measured {
  readonly text: MeasuredLabel;
  readonly font: FontKey;
  readonly style: number;
}

/** A label `m` with its box's top-left corner at (x, y). */
function placed(m: Measured, x: number, y: number): PlacedLabel {
  return {
    x,
    y,
    width: m.text.width,
    height: m.text.height,
    text: m.text,
    font: m.font,
    ...(m.style & Style.Bold ? { bold: true as const } : {}),
    ...(m.style & Style.Italic ? { italic: true as const } : {}),
  };
}

/** An element as the grid places it, with its outline and text. */
interface Node extends GridNode {
  readonly element: C4Element;
  readonly form: C4ShapeId;
  readonly dx: number;
  readonly dy: number;
  readonly sections: readonly (Measured | undefined)[];
  readonly textH: number;
}

/** A boundary (or the top level) as the grid places it, with its header. */
interface Group extends GridGroup {
  header: (Measured | undefined)[];
}

/** The box a mutable grid box is now at. */
const outlineOf = (
  g: { x: number; y: number; w: number; h: number },
  form: Outline['form']
): Outline => ({
  x: g.x,
  y: g.y,
  width: g.w,
  height: g.h,
  form,
});

/** Lays out a C4 diagram in px. */
export function layoutC4(model: C4Model, ctx: C4LayoutContext): C4Layout {
  const warn = ctx.warn ?? ignoreWarning;
  const config = c4LayoutConfig(ctx.config);
  const family = ctx.theme.value('fontFamily');
  const fonts = c4Fonts(ctx.config, family, warn);
  const inline = ctx.inline ? { inline: ctx.inline } : {};
  const measure = (
    text: string | undefined,
    font: FontKey,
    maxWidth: number,
    style = 0
  ): Measured | undefined =>
    text === undefined || text.trim() === ''
      ? undefined
      : {
          text: layoutLabel(text, font, maxWidth, ctx.measurer, {
            ...inline,
            keepWords: true,
            style,
          }),
          font,
          style,
        };

  // Measure first: elements.
  const nodes = model.elements.map((element, index) =>
    elementNode(element, index, config, fonts, measure)
  );

  // The groups: the top level, then each boundary under its parent (D454: a cycle broken).
  const { parents, moved } = brokenCycles(model);
  for (const i of moved) {
    const b = model.boundaries[i]!;
    warn({
      code: C4_BOUNDARY_CYCLE,
      message: `C4 boundary "${b.alias}" is inside itself; it is drawn at the top level`,
      astIds: [b.ast],
    });
  }
  const root: Group = group(-1, undefined, -1);
  const groups = model.boundaries.map((b, i) => group(i, b, parents[i]!));
  const groupOf = (i: number): Group => (i >= 0 ? groups[i]! : root);
  for (const g of groups) groupOf(g.parent).kids.push(g);
  for (const node of nodes)
    groupOf(node.element.parent < groups.length ? node.element.parent : -1).nodes.push(node);
  const order: Group[] = [root];
  // Breadth first: the iterator reads the boundaries pushed while it runs.
  for (const g of order) for (const kid of g.kids) order.push(kid as Group);

  const spacing: GridSpacing = {
    shapeGapX: 2 * config.c4ShapeMargin,
    shapeGapY: 2 * config.c4ShapeMargin,
    groupGapX: config.diagramMarginX,
    groupGapY: config.c4ShapeMargin + config.diagramMarginY,
    pad: config.c4ShapeMargin,
    nextLinePaddingX: config.nextLinePaddingX,
    headPadX: M.boundaryHeadPadX,
    shapeInRow: model.shapeInRow ?? config.c4ShapeInRow,
    boundaryInRow: model.boundaryInRow ?? config.c4BoundaryInRow,
  };
  placeGrid(order, spacing, (g, contentW) => header(g as Group, contentW, config, fonts, measure));

  // The outlines the router sees.
  const elementBoxes = new Map<string, Outline>();
  const shapes: Outline[] = [];
  for (const node of nodes) {
    const box = outlineOf(node, node.form);
    shapes.push(box);
    if (!elementBoxes.has(node.element.alias)) elementBoxes.set(node.element.alias, box);
  }
  const frames = new Map<string, Outline>();
  const frameList: Outline[] = [];
  for (const g of order) {
    if (g.index < 0) continue;
    const box = outlineOf(g, 'frame');
    frameList.push(box);
    if (!frames.has(g.boundary!.alias)) frames.set(g.boundary!.alias, box);
  }
  // v12 `getC4Shape`: an element first, then a boundary.
  const endOf = (alias: string): Outline | undefined =>
    elementBoxes.get(alias) ?? frames.get(alias);

  const relations = routeAll({
    model,
    endOf,
    shapes,
    frames: frameList,
    order,
    config,
    fonts,
    measure,
  });

  const title = measure(
    model.title,
    { family, size: M.titleFontSize, weight: FONT_WEIGHT.normal },
    Infinity
  );
  return assemble({ nodes, order, relations, ...(title ? { title } : {}), config });
}

function group(index: number, boundary: GridGroup['boundary'], parent: number): Group {
  return {
    index,
    ...(boundary ? { boundary } : {}),
    parent,
    depth: -1,
    kids: [],
    nodes: [],
    head: 0,
    headW: 0,
    header: [],
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
}

type Measure = (
  text: string | undefined,
  font: FontKey,
  maxWidth: number,
  style?: number
) => Measured | undefined;

/** An element's three sections, measured in its kind's font, and its shape's size around them. */
function elementNode(
  element: C4Element,
  index: number,
  config: C4LayoutConfig,
  fonts: C4Fonts,
  measure: Measure
): Node {
  const font = fonts.element(element.kind);
  const wrapW = config.wrap
    ? Math.max(config.width - 2 * config.c4ShapePadding, M.minWrapWidth)
    : Infinity;
  const sized = (scale: number): FontKey => ({ ...font, size: font.size * scale });
  const sections = [
    measure(element.label, font, wrapW, Style.Bold),
    measure(stereotypeText(element), sized(M.typeScale), wrapW),
    measure(element.descr, sized(M.descrScale), wrapW),
  ];
  let tw = 0;
  let textH = 0;
  let count = 0;
  for (const s of sections) {
    if (!s) continue;
    tw = Math.max(tw, s.text.width);
    textH += s.text.height;
    count++;
  }
  textH += Math.max(0, count - 1) * M.sectionGap;
  const form = shapeOf(element);
  const size = shapeSize(form, tw, textH, config.c4ShapePadding, config.width);
  return {
    index,
    element,
    form,
    sections,
    textH,
    dx: size.dx,
    dy: size.dy,
    x: 0,
    y: 0,
    w: size.w,
    h: size.h,
  };
}

/** A boundary's header (v12 `drawInsideBoundary`), wrapped to its contents' width when both wraps are on. */
function header(
  g: Group,
  contentW: number,
  config: C4LayoutConfig,
  fonts: C4Fonts,
  measure: Measure
): void {
  const b = g.boundary!;
  const f = fonts.boundary;
  const wrapW = config.wrapAll ? Math.max(contentW, config.width) : Infinity;
  const label = measure(b.label, { ...f, size: f.size + M.boundaryLabelGrow }, wrapW, Style.Bold);
  const type = measure(b.type ? `[${b.type}]` : undefined, f, wrapW);
  const descr = measure(
    b.descr,
    { ...f, size: Math.max(1, f.size - M.boundaryDescrShrink) },
    wrapW
  );
  let head = M.boundaryLabelTop + (label?.text.height ?? 0);
  if (type) head += M.boundaryTypeGap + type.text.height;
  if (descr) head += M.boundaryDescrGap + descr.text.height;
  g.header = [label, type, descr];
  g.head = head;
  g.headW = Math.max(label?.text.width ?? 0, type?.text.width ?? 0, descr?.text.width ?? 0);
}

/** A relation routed and labelled, before the final placement. */
interface Routed {
  readonly rel: C4Relation;
  readonly index: number;
  readonly route: Route;
  readonly startArrow: boolean;
  readonly endArrow: boolean;
  readonly label?: Measured;
  readonly techn?: Measured;
  /** The label box's centre and top. */
  readonly cx: number;
  readonly top: number;
}

interface RoutedAll {
  readonly list: readonly Routed[];
  readonly careful: boolean;
}

/** What routing the relations reads. */
interface RouteInput {
  readonly model: C4Model;
  readonly endOf: (alias: string) => Outline | undefined;
  readonly shapes: readonly Outline[];
  readonly frames: readonly Outline[];
  readonly order: readonly Group[];
  readonly config: C4LayoutConfig;
  readonly fonts: C4Fonts;
  readonly measure: Measure;
}

/**
 * What a label should not cover (Pele `render.ts`): shapes but their edges, arrowheads, boundary
 * headers and the labels placed before it, as x0, y0, x1, y1 runs.
 */
class Taken {
  private readonly boxes: number[] = [];

  add(x0: number, y0: number, x1: number, y1: number): void {
    this.boxes.push(x0, y0, x1, y1);
  }

  /** A square of half side `r` about (x, y). */
  around(x: number, y: number, r: number): void {
    this.add(x - r, y - r, x + r, y + r);
  }

  /** The area of the box x0, y0, x1, y1 that is taken. */
  covered(x0: number, y0: number, x1: number, y1: number): number {
    const t = this.boxes;
    let area = 0;
    for (let i = 0; i < t.length; i += 4) {
      const w = Math.min(x1, t[i + 2]!) - Math.max(x0, t[i]!);
      if (w <= 0) continue;
      const h = Math.min(y1, t[i + 3]!) - Math.max(y0, t[i + 1]!);
      if (h > 0) area += w * h;
    }
    return area;
  }
}

/** Routes every relation with known ends in model order, then places their labels (Pele `render.ts`). */
function routeAll(input: RouteInput): RoutedAll {
  const { model, endOf, shapes, frames, order } = input;
  const drawn: { rel: C4Relation; index: number; a: Outline; b: Outline }[] = [];
  const pairs = new Map<Outline, Set<Outline>>();
  model.relations.forEach((rel, index) => {
    const a = endOf(rel.from);
    const b = endOf(rel.to);
    if (!a || !b) return;
    drawn.push({ rel, index, a, b });
    let targets = pairs.get(a);
    if (!targets) pairs.set(a, (targets = new Set()));
    targets.add(b);
  });
  const careful =
    drawn.length * (shapes.length + order.length + M.carePerRelation * drawn.length) <=
    M.careBudget;

  const taken = new Taken();
  for (const s of shapes)
    taken.add(
      s.x + M.labelEdge,
      s.y + M.labelEdge,
      s.x + s.width - M.labelEdge,
      s.y + s.height - M.labelEdge
    );
  // Every line is routed before any label is placed, so that labels can keep off the arrowheads.
  const lanes = new Lanes();
  for (const f of frames) lanes.frame(f);
  const routes = drawn.map(({ rel, a, b }) => {
    const reverse = a !== b && pairs.get(b)?.has(a) === true;
    const r = route(a, b, reverse ? M.pairShift : 0, careful ? shapes : undefined, lanes);
    const startArrow = rel.kind === 'birel' || rel.kind === 'rel_b';
    const endArrow = rel.kind !== 'rel_b';
    const p = r.points;
    const n = p.length;
    if (careful && startArrow) taken.around(p[0]!, p[1]!, M.arrow);
    if (careful && endArrow) taken.around(p[n - 2]!, p[n - 1]!, M.arrow);
    return { r, startArrow, endArrow };
  });
  if (careful)
    for (const g of order) {
      const box = headerBox(g);
      if (box) taken.add(box.x, box.y, box.x + box.width, box.y + box.height);
    }

  const list = drawn.map(({ rel, index }, k): Routed => {
    const { r, startArrow, endArrow } = routes[k]!;
    return {
      rel,
      index,
      route: r,
      startArrow,
      endArrow,
      ...placeLabel(rel, index, r, input, careful ? taken : undefined),
    };
  });
  return { list, careful };
}

const offset = (v: number | undefined): number =>
  v ? Math.max(-M.maxOffset, Math.min(M.maxOffset, v)) : 0;

/**
 * A relation's label and `[techn]`, measured and placed along its line (Pele `render.ts`): on
 * the line, or beside it when another relation runs the opposite way, moved by the author's
 * offsets; with `taken`, slid to the spot that covers least of it (and added to it).
 */
function placeLabel(
  rel: C4Relation,
  index: number,
  r: Route,
  { model, config, fonts, measure }: RouteInput,
  taken: Taken | undefined
): Pick<Routed, 'label' | 'techn' | 'cx' | 'top'> {
  const room = config.wrapAll ? r.room : Infinity;
  // v12 numbers C4Dynamic's relations in model order, from 1.
  const text = (model.c4Type === 'C4Dynamic' ? `${index + 1}: ` : '') + rel.label;
  const label = measure(text, fonts.message, room);
  const techn = measure(
    rel.techn ? `[${rel.techn}]` : undefined,
    fonts.message,
    room,
    Style.Italic
  );
  const lw = Math.max(label?.text.width ?? 0, techn?.text.width ?? 0) + M.labelPad;
  const lh = (label?.text.height ?? 0) + (techn?.text.height ?? 0);
  if (lh === 0) return { cx: r.x0, top: r.y0 };

  const beside = Math.abs(r.nx) * (lw / 2) + Math.abs(r.ny) * (lh / 2) + M.besideGap;
  const aside = r.lean ? Math.max(0, Math.min(r.lean, beside - M.leanSlack)) : beside;
  let dx = r.nx * aside + offset(rel.offsetX);
  let dy = r.ny * aside + offset(rel.offsetY);
  let at = M.slide[0]!;
  if (taken) {
    // Slide along the line to the spot that covers least. Offsets from the diagram are kept
    // unless a spot on the line itself covers less than any they lead to.
    let least = Infinity;
    const moved = dx !== r.nx * aside || dy !== r.ny * aside;
    const tries: [number, number][] = moved
      ? [
          [dx, dy],
          [r.nx * aside, r.ny * aside],
        ]
      : [[dx, dy]];
    for (const [px, py] of tries) {
      if (least === 0) break;
      for (const t of M.slide) {
        const x = r.x0 + (r.x1 - r.x0) * t + px;
        const y = r.y0 + (r.y1 - r.y0) * t + py;
        const area = taken.covered(x - lw / 2, y - lh / 2, x + lw / 2, y + lh / 2);
        if (area < least) [least, at, dx, dy] = [area, t, px, py];
        if (area === 0) break;
      }
    }
  }
  const cx = r.x0 + (r.x1 - r.x0) * at + dx;
  const top = r.y0 + (r.y1 - r.y0) * at + dy - lh / 2;
  taken?.add(cx - lw / 2, top, cx + lw / 2, top + lh);
  return { ...(label ? { label } : {}), ...(techn ? { techn } : {}), cx, top };
}

/** A boundary's header box, centred under the frame's top edge; none at the top level. */
function headerBox(g: Group): Rect | undefined {
  if (g.index < 0) return undefined;
  const [label, type, descr] = g.header;
  if (!label && !type && !descr) return undefined;
  const y = g.y + M.boundaryLabelTop;
  return { x: g.x + (g.w - g.headW) / 2, y, width: g.headW, height: g.y + g.head - y };
}

interface Parts {
  readonly nodes: readonly Node[];
  readonly order: readonly Group[];
  readonly relations: RoutedAll;
  readonly title?: Measured;
  readonly config: C4LayoutConfig;
}

/** The move from the grid's frame onto the canvas. */
interface Shift {
  readonly ox: number;
  readonly oy: number;
}

/** A label's box: the label and `[techn]` stacked, with the label pad across. */
function labelSize(r: Pick<Routed, 'label' | 'techn'>): [number, number] {
  const lw = Math.max(r.label?.text.width ?? 0, r.techn?.text.width ?? 0) + M.labelPad;
  return [lw, (r.label?.text.height ?? 0) + (r.techn?.text.height ?? 0)];
}

/** Everything drawn, in the grid's frame: x0, y0, x1, y1 (zeros when nothing is). */
function extent(p: Parts): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (x: number, y: number, w = 0, h = 0): void => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + w);
    y1 = Math.max(y1, y + h);
  };
  for (const g of p.order) if (g.index >= 0) grow(g.x, g.y, g.w, g.h);
  for (const n of p.nodes) grow(n.x, n.y, n.w, n.h);
  for (const r of p.relations.list) {
    const pts = [...r.route.points, ...(r.route.controls ?? [])];
    for (let i = 0; i < pts.length; i += 2) grow(pts[i]!, pts[i + 1]!);
    if (r.label || r.techn) {
      const [lw, lh] = labelSize(r);
      grow(r.cx - lw / 2, r.top, lw, lh);
    }
  }
  return x0 === Infinity ? [0, 0, 0, 0] : [x0, y0, x1, y1];
}

const boxAt = ({ ox, oy }: Shift, b: { x: number; y: number; w: number; h: number }): Rect => ({
  x: b.x + ox,
  y: b.y + oy,
  width: b.w,
  height: b.h,
});

/** An element's layout, its sections stacked and centred on its text's centre (v12 `c4LabelHelper`). */
function elementOut(n: Node, s: Shift): C4ElementLayout {
  const centreX = n.x + s.ox + n.w / 2 + n.dx;
  let y = n.y + s.oy + n.h / 2 + n.dy - n.textH / 2;
  const [name, type, descr] = n.sections.map((m) => {
    if (!m) return undefined;
    const out = placed(m, centreX - m.text.width / 2, y);
    y += m.text.height + M.sectionGap;
    return out;
  });
  return {
    ast: n.element.ast,
    alias: n.element.alias,
    kind: n.element.kind,
    index: n.index,
    shape: n.form,
    box: boxAt(s, n),
    ...(name ? { name } : {}),
    type: type!,
    ...(descr ? { descr } : {}),
  };
}

/** A boundary's layout, its header lines centred at v12's offsets from the frame's top. */
function boundaryOut(g: Group, s: Shift): C4BoundaryLayout {
  const b = g.boundary!;
  const centreX = g.x + s.ox + g.w / 2;
  let y = g.y + s.oy + M.boundaryLabelTop;
  const gaps = [0, M.boundaryTypeGap, M.boundaryDescrGap];
  const [label, type, descr] = g.header.map((m, k) => {
    if (!m) return undefined;
    y += gaps[k]!;
    const out = placed(m, centreX - m.text.width / 2, y);
    y += m.text.height;
    return out;
  });
  return {
    ast: b.ast,
    alias: b.alias,
    ...(b.nodeKind ? { nodeKind: b.nodeKind } : {}),
    index: g.index,
    parent: g.parent,
    depth: g.depth,
    box: boxAt(s, g),
    ...(label ? { label } : {}),
    ...(type ? { type } : {}),
    ...(descr ? { descr } : {}),
    head: g.head,
  };
}

/** A relation's layout. */
function relationOut(r: Routed, { ox, oy }: Shift): C4RelationLayout {
  const at = (q: Point): Point => ({ x: q.x + ox, y: q.y + oy });
  const pts = pointsOf(r.route.points).map(at);
  const c = r.route.controls ? pointsOf(r.route.controls).map(at) : [];
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const top = r.top + oy;
  const cx = r.cx + ox;
  const label = r.label && placed(r.label, cx - r.label.text.width / 2, top);
  const technTop = top + (r.label?.text.height ?? 0);
  const techn = r.techn && placed(r.techn, cx - r.techn.text.width / 2, technTop);
  return {
    ast: r.rel.ast,
    index: r.index,
    kind: r.rel.kind,
    from: r.rel.from,
    to: r.rel.to,
    route: r.route.kind,
    points: pts,
    ...(c.length === 2 ? { controls: [c[0]!, c[1]!] as const } : {}),
    start: { ...first, dx: r.route.sdx, dy: r.route.sdy },
    end: { ...last, dx: r.route.edx, dy: r.route.edy },
    startArrow: r.startArrow,
    endArrow: r.endArrow,
    ...(label ? { label } : {}),
    ...(techn ? { techn } : {}),
  };
}

/** Everything placed, moved onto the canvas: the margins round it and the title row above. */
function assemble(p: Parts): C4Layout {
  const [x0, y0, x1, y1] = extent(p);
  const { diagramMarginX: mx, diagramMarginY: my } = p.config;
  const contentW = Math.max(x1 - x0, p.title?.text.width ?? 0);
  const contentH = y1 - y0;
  const titleRow = p.title ? M.titleRow : 0;
  // The contents centred under a wider title.
  const shift: Shift = { ox: mx - x0 + (contentW - (x1 - x0)) / 2, oy: my + titleRow - y0 };
  const title =
    p.title &&
    placed(
      p.title,
      mx + (contentW - p.title.text.width) / 2,
      my + (titleRow - p.title.text.height) / 2
    );
  const content = { x: mx, y: my + titleRow, width: contentW, height: contentH };
  return {
    width: contentW + 2 * mx,
    height: titleRow + contentH + 2 * my,
    ...(title ? { title } : {}),
    boundaries: p.order.filter((g) => g.index >= 0).map((g) => boundaryOut(g, shift)),
    elements: p.nodes.map((n) => elementOut(n, shift)),
    relations: p.relations.list.map((r) => relationOut(r, shift)),
    bounds: title ? union(content, title) : content,
    careful: p.relations.careful,
  };
}

/** Two boxes together. */
function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}
