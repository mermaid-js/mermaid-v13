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
import {
  layoutLabel,
  Style,
  type FontKey,
  type Measurer,
  type MeasuredLabel,
} from '@mermaid-js/core/text';
import { unionRects } from '@mermaid-js/shared/layout';
import { C4_BOUNDARY_CYCLE } from '../codes.ts';
import { c4Fonts, c4LayoutConfig, type C4Fonts, type C4LayoutConfig } from '../config.ts';
import {
  kindParts,
  type C4Boundary,
  type C4Element,
  type C4Family,
  type C4Model,
  type C4Relation,
} from '../model.ts';
import {
  brokenCycles,
  placeGrid,
  setDirections,
  type GridGroup,
  type GridNode,
  type GridSpacing,
} from './grid.ts';
import { cellConfig, cellPxMeasurer, cellRoom, type CellSize } from './cells.ts';
import { C4_METRICS as M, FONT_WEIGHT } from './metrics.ts';
import { classicLabelRoom, type LabelRoom } from './room.ts';
import { pairPlaces } from './pairs.ts';
import { Lanes, lineOf, pointsOf, route, Work, type Route } from './route.ts';
import {
  hitRect,
  labelBlockers,
  outlineForm,
  shapeOf,
  shapeSize,
  type Outline,
  type ShapeRoom,
} from './shapes.ts';
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

/**
 * What the layout reads from the render context. With the cell profile (`units.id === 'cell'`,
 * text output) it lays out in px with the text measured in cells (`./cells.ts`, D459).
 */
export type C4LayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'inline' | 'warn' | 'limits' | 'units'>>;

/** For a layout run without a `warn` sink (unit tests, the invariants). */
const ignoreWarning = (): void => undefined;

/** v12 `c4ShapeAdapter.ts` `STEREOTYPE_NAMES`. */
const STEREOTYPES: Readonly<Record<C4Family, string>> = {
  person: 'Person',
  system: 'Software System',
  container: 'Container',
  component: 'Component',
};

/** v12's type line: `[Person]`, `[Software System]`, `[Container: techn]` (external, db and queue as their base). */
export function stereotypeText(element: Pick<C4Element, 'kind' | 'techn'>): string {
  const name = STEREOTYPES[kindParts(element.kind).family];
  return element.techn ? `[${name}: ${element.techn}]` : `[${name}]`;
}

/** A boundary's `[type]` line, when it has a type (v12 `drawInsideBoundary`). */
export function boundaryTypeText(boundary: Pick<C4Boundary, 'type'>): string | undefined {
  return boundary.type ? `[${boundary.type}]` : undefined;
}

/** A relation's drawn label: C4Dynamic numbers its relations in model order, from 1 (v12). */
export function relationLabelText(
  model: Pick<C4Model, 'c4Type'>,
  rel: C4Relation,
  index: number
): string {
  return (model.c4Type === 'C4Dynamic' ? `${index + 1}: ` : '') + rel.label;
}

/** A relation's `[techn]` line, when it has one. */
export function relationTechnText(rel: Pick<C4Relation, 'techn'>): string | undefined {
  return rel.techn ? `[${rel.techn}]` : undefined;
}

/** A text measured, before it is placed. */
export interface Measured {
  readonly text: MeasuredLabel;
  readonly font: FontKey;
  readonly style: number;
}

/** A label `m` with its box's top-left corner at (x, y). */
export function placed(m: Measured, x: number, y: number): PlacedLabel {
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

/** Measures a text in a font, wrapped at `maxWidth`; none for an empty text. */
export type Measure = (
  text: string | undefined,
  font: FontKey,
  maxWidth: number,
  style?: number
) => Measured | undefined;

/** The one way C4 text is measured, for both syntaxes: whole words kept, inline spans boxed. */
export function textMeasure(measurer: Measurer, inlineSpans?: C4LayoutContext['inline']): Measure {
  const inline = inlineSpans ? { inline: inlineSpans } : {};
  return (text, font, maxWidth, style = 0) =>
    text === undefined || text.trim() === ''
      ? undefined
      : {
          text: layoutLabel(text, font, maxWidth, measurer, { ...inline, keepWords: true, style }),
          font,
          style,
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
  const units = ctx.units?.id === 'cell' ? ctx.units : undefined;
  const config = units
    ? cellConfig(c4LayoutConfig(ctx.config), units, warn)
    : c4LayoutConfig(ctx.config);
  const measurer = units ? cellPxMeasurer(ctx.measurer, units.pxPerUnit) : ctx.measurer;
  const family = ctx.theme.value('fontFamily');
  const fonts = c4Fonts(ctx.config, family, warn);
  const measure = textMeasure(measurer, ctx.inline);

  // Measure first: elements.
  const room = units
    ? cellRoom(shapeRoom(config, ctx.theme), units.pxPerUnit)
    : shapeRoom(config, ctx.theme);
  const nodes = model.elements.map((element, index) =>
    elementNode(element, index, { config, fonts, measure }, room)
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
  setDirections(order, model.direction);

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
  placeGrid(order, spacing, (g, contentW) =>
    header(g as Group, contentW, { config, fonts, measure })
  );

  // The outlines the router sees.
  const elementBoxes = new Map<string, Outline>();
  const shapes: Outline[] = [];
  for (const node of nodes) {
    const box = outlineOf(node, outlineForm(node.form, units !== undefined));
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
    budget: Math.min(M.careBudget, ctx.limits?.maxLayoutWork ?? Infinity),
    endOf,
    shapes,
    frames: frameList,
    order,
    config,
    fonts,
    measure,
    labelRoom: classicLabelRoom(ctx.units),
    tags: units === undefined,
  });

  const title = measure(
    model.title,
    { family, size: M.titleFontSize, weight: FONT_WEIGHT.normal },
    Infinity
  );
  const cell = units ? { cell: units.pxPerUnit } : {};
  return assemble({ nodes, order, relations, ...(title ? { title } : {}), config, ...cell });
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

/** What measuring an element's or a boundary's text reads. */
interface Measuring {
  readonly config: C4LayoutConfig;
  readonly fonts: C4Fonts;
  readonly measure: Measure;
}

/**
 * The shapes' padding: `c4ShapePadding` all round, and the cylinder's, the queue's and
 * `fr-rect`'s totals from the theme's shape rows (D152), `2·pad` in the classic themes.
 */
export function shapeRoom(config: C4LayoutConfig, theme: C4LayoutContext['theme']): ShapeRoom {
  const total = 2 * config.c4ShapePadding;
  const pad = (name: string, base = total): number => theme.padding(name, base);
  return {
    pad: config.c4ShapePadding,
    least: config.width,
    figure: true,
    cylinder: { x: pad('cylinderPaddingX'), y: pad('cylinderPaddingY') },
    // The queue has no row of its own: it reads half the cylinder's token, as v12's tilted
    // cylinder padded half what its cylinder did in both looks. Under neo that is 12 (half of
    // 24); in the classic themes the base is doubled first, so the queue keeps `2·pad` as the
    // cylinder does. An author's `cylinderPadding*` override moves the queue too (half of it).
    queue: {
      x: pad('cylinderPaddingX', 2 * total) / 2,
      y: pad('cylinderPaddingY', 2 * total) / 2,
    },
    subroutine: { x: pad('subroutinePaddingX'), y: pad('subroutinePaddingY') },
  };
}

/** What measuring an element's three text sections reads. */
export interface SectionRoom {
  readonly font: FontKey;
  readonly config: C4LayoutConfig;
  readonly measure: Measure;
  /** The width the text wraps at when `config.wrap` is on, in place of the `c4` width's. */
  readonly wrapWidth?: number;
}

/** An element's name (bold), type line and description, measured in its kind's font. */
export function measureSections(
  texts: { readonly name: string; readonly type: string; readonly descr?: string },
  { font, config, measure, wrapWidth }: SectionRoom
): (Measured | undefined)[] {
  const wrapW = config.wrap
    ? Math.max(wrapWidth ?? config.width - 2 * config.c4ShapePadding, M.minWrapWidth)
    : Infinity;
  const sized = (scale: number): FontKey => ({ ...font, size: font.size * scale });
  return [
    measure(texts.name, font, wrapW, Style.Bold),
    measure(texts.type, sized(M.typeScale), wrapW),
    measure(texts.descr, sized(M.descrScale), wrapW),
  ];
}

/** The sections placed one under another, centred on `centreX`, the first at `top`. */
export function stackSections(
  sections: readonly (Measured | undefined)[],
  centreX: number,
  top: number
): (PlacedLabel | undefined)[] {
  let y = top;
  return sections.map((m) => {
    if (!m) return undefined;
    const out = placed(m, centreX - m.text.width / 2, y);
    y += m.text.height + M.sectionGap;
    return out;
  });
}

/** An element's three sections, measured in its kind's font, and its shape's size around them. */
function elementNode(
  element: C4Element,
  index: number,
  { config, fonts, measure }: Measuring,
  room: ShapeRoom
): Node {
  const sections = measureSections(
    { name: element.label, type: stereotypeText(element), descr: element.descr },
    { font: fonts.element(element.kind), config, measure }
  );
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
  const size = shapeSize(form, tw, textH, room);
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

/**
 * A boundary's header (v12 `drawInsideBoundary`), wrapped to its contents' width when both wraps
 * are on. It is measured once the grid knows that width (the one text measured during the grid,
 * from `placeGrid`'s callback), and before the boundary is sized.
 */
function header(g: Group, contentW: number, { config, fonts, measure }: Measuring): void {
  const b = g.boundary!;
  const f = fonts.boundary;
  const wrapW = config.wrapAll ? Math.max(contentW, config.width) : Infinity;
  const label = measure(b.label, { ...f, size: f.size + M.boundaryLabelGrow }, wrapW, Style.Bold);
  const type = measure(boundaryTypeText(b), f, wrapW);
  const descr = measure(
    b.descr,
    { ...f, size: Math.max(M.minFontSize, f.size - M.boundaryDescrShrink) },
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
  /** The label box's centre and top, and its size (zero without a label). */
  readonly cx: number;
  readonly top: number;
  readonly lw: number;
  readonly lh: number;
  /** No spot kept the label off its arrowheads, the shapes and the headers. */
  readonly crowded?: true;
}

interface RoutedAll {
  readonly list: readonly Routed[];
  readonly careful: boolean;
}

/** What routing the relations reads. */
interface RouteInput extends Measuring {
  readonly model: C4Model;
  /** Comparisons the router and the label placement may make (R-SEC-5, D455, D542). */
  readonly budget: number;
  readonly endOf: (alias: string) => Outline | undefined;
  readonly shapes: readonly Outline[];
  readonly frames: readonly Outline[];
  readonly order: readonly Group[];
  /**
   * The room a label's box adds round its stacked texts, in px: the `labelPatch` (D629) where
   * the box is drawn as an edge-label tag; text output keeps `textLabelPad` across.
   */
  readonly labelRoom: LabelRoom;
  /**
   * Whether labels are drawn as edge-label tags (SVG output). Text output frames its labels
   * itself and keeps the placement it had before the tags (`textLabelPad`).
   */
  readonly tags: boolean;
}

/**
 * What a label should not cover (Pele `render.ts`): shapes but their edges, arrowheads, boundary
 * headers and the labels placed before it, as x0, y0, x1, y1 runs.
 */
class Taken {
  private readonly boxes: number[] = [];

  constructor(private readonly work: Work) {}

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
    this.work.charge(t.length / 4);
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

/**
 * Every relation's line, so that a label keeps off the others' (#522 final review): the
 * stretches as x0, y0, x1, y1 runs, each with the index of the relation it is part of.
 */
class Lines {
  private readonly runs: number[] = [];
  private readonly owners: number[] = [];

  constructor(private readonly work: Work) {}

  /** The polyline (x, y pairs) of relation `owner`. */
  add(owner: number, line: readonly number[]): void {
    for (let i = 2; i < line.length; i += 2) {
      this.runs.push(line[i - 2]!, line[i - 1]!, line[i]!, line[i + 1]!);
      this.owners.push(owner);
    }
  }

  /** How many stretches of relations other than `own` clip the box x0, y0, x1, y1 (Liang–Barsky). */
  through(own: number, x0: number, y0: number, x1: number, y1: number): number {
    const t = this.runs;
    this.work.charge(this.owners.length);
    const box = { x0, y0, x1, y1 };
    let count = 0;
    for (let k = 0; k < this.owners.length; k++) {
      if (this.owners[k] === own) continue;
      const i = 4 * k;
      const p = { x: t[i]!, y: t[i + 1]! };
      if (hitRect(box, p, { x: t[i + 2]! - p.x, y: t[i + 3]! - p.y }) <= 1) count++;
    }
    return count;
  }
}

/** Routes every relation with known ends in model order, then places their labels (Pele `render.ts`). */
function routeAll(input: RouteInput): RoutedAll {
  const { model, endOf, shapes, frames, order } = input;
  const drawn: { rel: C4Relation; index: number; a: Outline; b: Outline }[] = [];
  model.relations.forEach((rel, index) => {
    const a = endOf(rel.from);
    const b = endOf(rel.to);
    if (!a || !b) return;
    drawn.push({ rel, index, a, b });
  });
  // A one-line tag's height and a gap either side: the step between tagged lines side by side.
  const line = input.measure('X', input.fonts.message, Infinity);
  const tagStep = input.tags && line ? line.text.height + input.labelRoom.y + 2 * M.besideGap : 0;
  const places = pairPlaces(drawn, tagStep);
  // The comparisons are counted as they are made: once the budget is spent, the relations still
  // to route go straight and the labels still to place sit at their middle, in model order.
  const work = new Work(input.budget);
  let careful = true;
  const taken = new Taken(work);
  // What a label must never cover: every shape (a person's head and body) and every boundary
  // header; with tags, also every label placed before it.
  const blocked = new Taken(work);
  const parts = shapes.flatMap(labelBlockers);
  const clear = input.tags ? M.tagClear : 0;
  for (const s of parts)
    blocked.add(s.x - clear, s.y - clear, s.x + s.width + clear, s.y + s.height + clear);
  for (const s of parts)
    taken.add(
      s.x + M.labelEdge,
      s.y + M.labelEdge,
      s.x + s.width - M.labelEdge,
      s.y + s.height - M.labelEdge
    );
  // Every line is routed before any label is placed, so that labels can keep off the arrowheads.
  const lanes = new Lanes(work);
  for (const f of frames) lanes.frame(f);
  const routes = drawn.map(({ rel, a, b }, k) => {
    if (work.done) careful = false;
    const place = places[k] ?? { shift: 0 };
    const routed = route(a, b, { ...place, ...(work.done ? {} : { others: shapes }), lanes });
    // A straight line spaced a tag from the next keeps its label on it (#955 review).
    const r = place.spaced && routed.kind === 'line' ? { ...routed, nx: 0, ny: 0 } : routed;
    const startArrow = rel.kind === 'birel' || rel.kind === 'rel_b';
    const endArrow = rel.kind !== 'rel_b';
    const p = r.points;
    const n = p.length;
    const heads: number[] = [];
    if (startArrow) heads.push(p[0]!, p[1]!);
    if (endArrow) heads.push(p[n - 2]!, p[n - 1]!);
    for (let i = 0; i < heads.length; i += 2) taken.around(heads[i]!, heads[i + 1]!, M.arrow);
    return { r, startArrow, endArrow, heads };
  });
  const lines = new Lines(work);
  routes.forEach(({ r }, k) => lines.add(k, lineOf(r.points, r.controls)));
  for (const g of order) {
    const box = headerBox(g);
    if (!box) continue;
    taken.add(box.x, box.y, box.x + box.width, box.y + box.height);
    blocked.add(box.x, box.y, box.x + box.width, box.y + box.height);
  }

  const list = drawn.map(({ rel, index }, k): Routed => {
    const { r, startArrow, endArrow, heads } = routes[k]!;
    if (work.done) careful = false;
    const keep = work.done
      ? undefined
      : { taken, blocked, heads, lines, own: k, work, tags: input.tags };
    const placedLabel = placeLabel({ rel, index, r, input, keep });
    return { rel, index, route: r, startArrow, endArrow, ...placedLabel };
  });
  return { list, careful };
}

const offset = (v: number | undefined): number =>
  v ? Math.max(-M.maxOffset, Math.min(M.maxOffset, v)) : 0;

/** What placing one relation's label reads. */
interface LabelInput {
  readonly rel: C4Relation;
  readonly index: number;
  readonly r: Route;
  readonly input: RouteInput;
  /** What the label should keep off; undefined once the budget is spent. */
  readonly keep: Keep | undefined;
}

/** What a label keeps off while it is placed. */
interface Keep {
  /** What it should cover least of: shapes but their edges, arrowheads, headers, labels. */
  readonly taken: Taken;
  /** What it must not cover at all: whole shapes and boundary headers. */
  readonly blocked: Taken;
  /** Its own arrowheads' tips, as x, y pairs: it must not cover their squares either. */
  readonly heads: readonly number[];
  /** Every relation's line; the label should keep off all but its own (`own`, by index in `Lines`). */
  readonly lines: Lines;
  readonly own: number;
  readonly work: Work;
  /** Labels are drawn as tags (`RouteInput.tags`): placed labels block, and on the line comes first. */
  readonly tags: boolean;
}

/** A label box, x0, y0, x1, y1. */
interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * A placed label, for the labels after it: one to cover least of, and with tags one never to
 * cover, since a tag is opaque (#955 review).
 */
function keepOff(keep: Keep | undefined, { x0, y0, x1, y1 }: Box): void {
  if (!keep) return;
  keep.taken.add(x0, y0, x1, y1);
  if (keep.tags) keep.blocked.add(x0, y0, x1, y1);
}

/** How much of a label box it must not cover: `blocked`, and its own heads. */
function forbidden(keep: Keep, { x0, y0, x1, y1 }: Box): number {
  let area = keep.blocked.covered(x0, y0, x1, y1);
  const h = keep.heads;
  keep.work.charge(h.length / 2);
  for (let i = 0; i < h.length; i += 2) {
    const w = Math.min(x1, h[i]! + M.arrow) - Math.max(x0, h[i]! - M.arrow);
    const t = Math.min(y1, h[i + 1]! + M.arrow) - Math.max(y0, h[i + 1]! - M.arrow);
    if (w > 0 && t > 0) area += w * t;
  }
  return area;
}

/**
 * A relation's label and `[techn]`, measured and placed along its line (Pele `render.ts`): on
 * the line, or beside it when another relation runs the opposite way, moved by the author's
 * offsets; with `taken`, slid to the spot that covers least of it (and added to it). Measured
 * after routing, as Pele does: its wrap width (the route's `room`) depends on the line it sits on.
 */
function placeLabel({
  rel,
  index,
  r,
  input,
  keep,
}: LabelInput): Pick<Routed, 'label' | 'techn' | 'cx' | 'top' | 'lw' | 'lh' | 'crowded'> {
  const { model, config, fonts, measure, labelRoom } = input;
  const room = config.wrapAll ? r.room : Infinity;
  const label = measure(relationLabelText(model, rel, index), fonts.message, room);
  const techn = measure(relationTechnText(rel), fonts.message, room, Style.Italic);
  if (!label && !techn) return { cx: r.x0, top: r.y0, lw: 0, lh: 0 };
  const lw = Math.max(label?.text.width ?? 0, techn?.text.width ?? 0) + labelRoom.x;
  const lh = (label?.text.height ?? 0) + (techn?.text.height ?? 0) + labelRoom.y;

  const beside = Math.abs(r.nx) * (lw / 2) + Math.abs(r.ny) * (lh / 2) + M.besideGap;
  const aside = r.lean ? Math.max(0, Math.min(r.lean, beside - M.leanSlack)) : beside;
  let dx = r.nx * aside + offset(rel.offsetX);
  let dy = r.ny * aside + offset(rel.offsetY);
  let at = M.slide[0]!;
  let crowded = false;
  if (keep)
    ({ at, dx, dy, crowded } = clearest({
      r,
      lw,
      lh,
      given: [dx, dy],
      online: [r.nx * aside, r.ny * aside],
      keep,
    }));
  const cx = r.x0 + (r.x1 - r.x0) * at + dx;
  const top = r.y0 + (r.y1 - r.y0) * at + dy - lh / 2;
  keepOff(keep, { x0: cx - lw / 2, y0: top, x1: cx + lw / 2, y1: top + lh });
  return {
    ...(label ? { label } : {}),
    ...(techn ? { techn } : {}),
    cx,
    top,
    lw,
    lh,
    ...(crowded ? { crowded: true as const } : {}),
  };
}

/** What finding a label's spot reads. */
interface ClearestInput {
  readonly r: Route;
  /** The label box's size. */
  readonly lw: number;
  readonly lh: number;
  /** Its offset from the line's stretch: the author's offsets added, and without them. */
  readonly given: readonly [number, number];
  readonly online: readonly [number, number];
  readonly keep: Keep;
}

/** Where a label goes: `at` along its stretch, `dx`, `dy` off it. */
interface Clearest {
  readonly at: number;
  readonly dx: number;
  readonly dy: number;
  /** No spot was clear: the one taken covers what it should not, or another relation's line. */
  readonly crowded: boolean;
}

/**
 * Where along the line, and how far off it, a `lw` × `lh` label goes. First on the line (the
 * author's offsets, then none; a tag pushed beside its line also tries the line itself), slid to
 * the spot that covers least of `taken` (Pele `render.ts`), each other relation's stretch through
 * it costing `lineCover` of its area; a tag then also tries the finer steps of `fineSlide` on the
 * line, so that one fitting between the shapes stays on it (#955 review); when that spot still
 * costs anything, also beside the line on either side, a label's depth further out at each step. When no spot is clear, the search runs again with finer steps along the line
 * (`fineSlide`) and beside it (`fineSplit` per depth), so a label wider than the gaps the coarse
 * steps try still finds one between them; a label that found a clear spot is not moved. A spot
 * that covers `forbidden` is never taken while another does not; when none clears it, the one
 * that covers least of it is, and the label is crowded, as it is when the spot taken lies over
 * another relation's line.
 */
function clearest({ r, lw, lh, given, online, keep }: ClearestInput): Clearest {
  let best = { at: M.slide[0]!, dx: given[0], dy: given[1] };
  let [least, worst, crossed] = [Infinity, Infinity, 0];
  const perLine = M.lineCover * lw * lh;
  // A clear spot's cost: what it covers of `taken`, the lines through it, how far out it is.
  const costOf = (box: Box, away: number): [number, number] => {
    const lines = keep.lines.through(keep.own, box.x0, box.y0, box.x1, box.y1);
    const cover = keep.taken.covered(box.x0, box.y0, box.x1, box.y1);
    return [lines, cover + (lines + away * M.besideStepCost) * perLine];
  };
  const tryAt = (slides: readonly number[], px: number, py: number, away = 0): boolean => {
    for (const t of slides) {
      const [x, y] = [r.x0 + (r.x1 - r.x0) * t + px, r.y0 + (r.y1 - r.y0) * t + py];
      const box: Box = { x0: x - lw / 2, y0: y - lh / 2, x1: x + lw / 2, y1: y + lh / 2 };
      const bad = forbidden(keep, box);
      if (bad > worst || (bad === worst && bad > 0)) continue;
      const [lines, cost] = bad > 0 ? [0, Infinity] : costOf(box, away);
      if (bad < worst || cost < least) {
        [worst, least, crossed] = [bad, cost, lines];
        best = { at: t, dx: px, dy: py };
      }
      if (bad === 0 && cost === 0) return true;
    }
    return false;
  };
  // Offsets from the diagram are kept unless a spot on the line itself covers less. A tag pushed
  // beside its line (another relation runs the opposite way) also tries the line itself, which
  // lines spaced a tag apart leave clear.
  const same = (p: readonly [number, number], q: readonly [number, number]): boolean =>
    p[0] === q[0] && p[1] === q[1];
  const ons = same(given, online) ? [given] : [given, online];
  if (keep.tags && !ons.some((p) => same(p, [0, 0]))) ons.push([0, 0]);
  // Beside the line, on either side, one label depth further out at each step: across the
  // stretch the label sits on (a self-loop's has no length: then up and down).
  const len = Math.hypot(r.x1 - r.x0, r.y1 - r.y0);
  const [nx, ny] = len > 0 ? [-(r.y1 - r.y0) / len, (r.x1 - r.x0) / len] : [0, 1];
  const half = Math.abs(nx) * (lw / 2) + Math.abs(ny) * (lh / 2) + M.besideGap;
  const depth = Math.abs(nx) * lw + Math.abs(ny) * lh;
  const [ax, ay] = [given[0] - online[0], given[1] - online[1]];
  // One pass: `slides` along the line, `split` steps beside it per label depth. Each depth out
  // past the first costs a share of a line through the label: a label keeps by its own line
  // rather than move far from it to clear another's.
  const onLine = (slides: readonly number[]): boolean =>
    ons.some(([px, py]) => tryAt(slides, px, py));
  const pass = (slides: readonly number[], split: number): boolean => {
    // A tag tries the finer places on its line before any beside it (#955 review): one that fits
    // between the shapes stays on its line, where its bare text sat.
    const finer = keep.tags && slides !== M.fineSlide;
    if (onLine(slides) || (finer && onLine(M.fineSlide))) return true;
    const step = (M.besideStepCost * perLine) / split;
    for (let k = 0; k < M.besideSteps * split && (worst > 0 || k * step < least); k++)
      for (const side of [1, -1]) {
        const d = side * (half + (k * depth) / split);
        if (tryAt(slides, ax + nx * d, ay + ny * d, k / split)) return true;
      }
    return false;
  };
  // A tag the coarse search put a whole depth or more beside its line also tries the finer
  // steps beside it, so that it keeps `tagClear` from the shapes without floating a depth out.
  const far = keep.tags && least > 0;
  if (!pass(M.slide, 1) && (worst > 0 || crossed > 0 || far))
    pass(M.fineSlide, keep.tags ? M.tagSplit : M.fineSplit);
  return { ...best, crowded: worst > 0 || crossed > 0 };
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
  readonly cell?: CellSize;
}

/** The move from the grid's frame onto the canvas. */
interface Shift {
  readonly ox: number;
  readonly oy: number;
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
    if (r.label || r.techn) grow(r.cx - r.lw / 2, r.top, r.lw, r.lh);
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
  const y = n.y + s.oy + n.h / 2 + n.dy - n.textH / 2;
  const [name, type, descr] = stackSections(n.sections, centreX, y);
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

/** A label box at (`cx`, `top`): the label and `[techn]` stacked in its middle; none without. */
function labelOut(r: Routed, cx: number, top: number): Partial<C4RelationLayout> {
  const { label, techn, lw, lh } = r;
  if (!label && !techn) return {};
  const labelH = label?.text.height ?? 0;
  const textTop = top + (lh - labelH - (techn?.text.height ?? 0)) / 2;
  const at = (m: Measured, y: number): PlacedLabel => placed(m, cx - m.text.width / 2, y);
  return {
    ...(label ? { label: at(label, textTop) } : {}),
    ...(techn ? { techn: at(techn, textTop + labelH) } : {}),
    labelBox: { x: cx - lw / 2, y: top, width: lw, height: lh },
  };
}

/** A relation's layout. */
function relationOut(r: Routed, { ox, oy }: Shift): C4RelationLayout {
  const at = (q: Point): Point => ({ x: q.x + ox, y: q.y + oy });
  const pts = pointsOf(r.route.points).map(at);
  const c = r.route.controls ? pointsOf(r.route.controls).map(at) : [];
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
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
    ...labelOut(r, r.cx + ox, r.top + oy),
    ...(r.crowded ? { crowded: true as const } : {}),
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
    bounds: title ? unionRects([content, title]) : content,
    careful: p.relations.careful,
    ...(p.config.wrapAll ? { labelsWrap: true as const } : {}),
    ...(p.cell ? { cell: p.cell } : {}),
  };
}
