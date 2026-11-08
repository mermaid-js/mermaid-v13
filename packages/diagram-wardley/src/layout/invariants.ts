/**
 * The wardley layout's invariants (spec #430 "Testing Decisions", R-LAYOUT-3): what every
 * `WardleyLayout` must satisfy for the model it was laid out from. Empty when the layout is
 * sound; each entry names a broken rule. Exported from `@mermaid-js/diagram-wardley/testing` for
 * the conformance corpus spec, with `wardleyLabelOverlaps`, which the corpus spec asserts on the
 * e2e fixtures only (v12 places labels where the author says, so a hand-written case may stack them).
 */
import type { WardleyModel, WardleyNode } from '../model.ts';
import { textCorners } from './geometry.ts';
import { DEFAULT_STAGES, WARDLEY_METRICS as M } from './metrics.ts';
import type {
  PlacedText,
  Point,
  Rect,
  Segment,
  WardleyLayout,
  WardleyNodeLayout,
} from './types.ts';

/** Float tolerance of the checks, relative to the canvas. */
const EPS = 1e-6;
/** How far two label boxes may run into each other before they count as on top of one another. */
const OVERLAP_SLACK = 1;

/** What the checks share. */
interface Check {
  readonly model: WardleyModel;
  readonly layout: WardleyLayout;
  readonly out: string[];
  readonly tol: number;
  readonly near: (a: number, b: number) => boolean;
  readonly same: (a: Point, b: Point) => boolean;
  /** v12's projection. */
  readonly px: (evolution: number) => number;
  readonly py: (visibility: number) => number;
  /** The chart's x and y spans, low to high. */
  readonly xs: readonly [number, number];
  readonly ys: readonly [number, number];
  readonly nodes: ReadonlyMap<string, WardleyNodeLayout>;
  readonly byId: ReadonlyMap<string, WardleyNode>;
  /** The parents a pipeline moved. */
  readonly moved: ReadonlySet<string>;
  readonly square: number;
}

export function wardleyLayoutViolations(model: WardleyModel, layout: WardleyLayout): string[] {
  const out: string[] = [];
  finite(layout, 'layout', out);
  const { width: W, height: H, padding: p, nodeRadius: r, chart } = layout;
  const tol = EPS * Math.max(1, W, H);
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= tol;
  const ck: Check = {
    model,
    layout,
    out,
    tol,
    near,
    same: (a, b) => near(a.x, b.x) && near(a.y, b.y),
    px: (v) => p + (v / 100) * chart.width,
    py: (v) => H - p - (v / 100) * chart.height,
    xs: span(chart.x, chart.width),
    ys: span(chart.y, chart.height),
    nodes: new Map(layout.nodes.map((n) => [n.id, n])),
    byId: new Map(model.nodes.map((n) => [n.id, n])),
    moved: new Set(layout.pipelines.map((q) => q.nodeId)),
    square: r * M.pipeline.squareFactor,
  };
  if (!near(chart.width, W - p * 2) || !near(chart.height, H - p * 2))
    out.push('the chart is not the canvas inset by the padding');
  checkNodes(ck);
  checkPipelines(ck);
  checkLinks(ck);
  checkTrends(ck);
  checkStages(ck);
  checkBounds(ck);
  return out;
}

/** Nodes: one per model node in order, at its projection (in the chart) unless a pipeline moved it. */
function checkNodes(ck: Check): void {
  const { model, layout, out, tol, xs, ys } = ck;
  if (layout.nodes.map((n) => n.id).join('\n') !== model.nodes.map((n) => n.id).join('\n'))
    out.push('the nodes are not the model nodes in order');
  for (const n of model.nodes) {
    const l = ck.nodes.get(n.id);
    if (!l) continue;
    if (!ck.moved.has(n.id)) {
      if (!ck.same(l.point, { x: ck.px(n.x), y: ck.py(n.y) }))
        out.push(`node ${n.id} is off its position`);
      const inRange = n.x >= 0 && n.x <= 100 && n.y >= 0 && n.y <= 100;
      const { x, y } = l.point;
      if (inRange && (x < xs[0] - tol || x > xs[1] + tol || y < ys[0] - tol || y > ys[1] + tol))
        out.push(`node ${n.id} is outside the chart`);
    }
    let glyph = 'circle';
    if (n.isPipelineParent) glyph = 'square';
    else if (n.sourceStrategy === 'market' || n.className === 'anchor') glyph = 'none';
    if (l.glyph !== glyph) out.push(`node ${n.id} is drawn as ${l.glyph}, not ${glyph}`);
  }
}

/**
 * Pipelines: each parent at its box (centre x, lifted above the top); the children on the
 * parent's line (not merged elsewhere, not moved as parents themselves) are on it, and inside
 * the box when the box is on that line.
 */
function checkPipelines(ck: Check): void {
  const { model, layout, out, tol, near } = ck;
  for (const q of layout.pipelines) {
    const { box } = q;
    const parent = ck.nodes.get(q.nodeId);
    if (!near(box.height, layout.nodeRadius * M.pipeline.heightFactor))
      out.push(`pipeline ${q.nodeId}'s box height`);
    if (parent) {
      const want = { x: box.x + box.width / 2, y: box.y - ck.square * M.pipeline.lift };
      if (!ck.same(parent.point, want)) out.push(`pipeline ${q.nodeId}'s parent is not on its box`);
    }
    const pipeline = model.pipelines.find((m) => m.nodeId === q.nodeId);
    const parentModel = ck.byId.get(q.nodeId);
    if (!pipeline || !parentModel) {
      out.push(`pipeline ${q.nodeId} is not a model pipeline`);
      continue;
    }
    if (q.joins.length !== Math.max(0, pipeline.componentIds.length - 1))
      out.push(`pipeline ${q.nodeId} has ${q.joins.length} joins`);
    const line = ck.py(parentModel.y);
    const onBox = near(box.y + box.height / 2, line);
    const pad = M.pipeline.pad;
    for (const id of pipeline.componentIds) {
      const child = ck.nodes.get(id);
      if (!child || ck.moved.has(id) || ck.byId.get(id)?.y !== parentModel.y) continue;
      if (!near(child.point.y, line))
        out.push(`pipeline ${q.nodeId}: ${id} is off its parent's line`);
      const { x } = child.point;
      if (onBox && (x < box.x + pad - tol || x > box.x + box.width - pad + tol))
        out.push(`pipeline ${q.nodeId}: ${id} is outside its box`);
    }
  }
}

/**
 * Links: exactly the drawable ones, in order, each end on its own node's edge, on the line
 * between the centres, clear of both circles when the circles are apart; heads by flow.
 */
function checkLinks(ck: Check): void {
  const { model, layout, out, tol } = ck;
  const kids = new Map(model.pipelines.map((q) => [q.nodeId, new Set(q.componentIds)]));
  const edge = (n: WardleyNode): number =>
    n.isPipelineParent ? ck.square / Math.SQRT2 : layout.nodeRadius;
  const drawable = model.links.filter((k) => {
    const s = ck.nodes.get(k.source);
    const t = ck.nodes.get(k.target);
    if (!s || !t || k.source === k.target || kids.get(k.target)?.has(k.source)) return false;
    return !ck.same(s.point, t.point);
  });
  const want = drawable.map((k) => k.astId).join();
  const got = layout.links.map((k) => k.ast).join();
  if (want !== got) out.push(`drawn links ${got} for ${want}`);
  for (const k of layout.links) {
    const s = ck.nodes.get(k.source);
    const t = ck.nodes.get(k.target);
    const sm = ck.byId.get(k.source);
    const tm = ck.byId.get(k.target);
    if (!s || !t || !sm || !tm) continue;
    const rs = edge(sm);
    const rt = edge(tm);
    if (!ck.near(dist(k.from, s.point), rs) || !ck.near(dist(k.to, t.point), rt))
      out.push(`link ${k.ast}'s ends are not on its nodes' edges`);
    if (!onLine(k.from, s.point, t.point, tol) || !onLine(k.to, s.point, t.point, tol))
      out.push(`link ${k.ast} leaves the line between its nodes`);
    const apart = dist(s.point, t.point) >= rs + rt;
    if (apart && (toSegment(s.point, k) < rs - tol || toSegment(t.point, k) < rt - tol))
      out.push(`link ${k.ast} runs into a node`);
    const flow = model.links.find((m) => m.astId === k.ast)?.flow;
    const heads = [
      flow === 'backward' || flow === 'bidirectional' ? 'start' : '',
      flow === 'forward' || flow === 'bidirectional' ? 'end' : '',
    ].filter(Boolean);
    if (Object.keys(k.heads).sort().join() !== heads.sort().join())
      out.push(`link ${k.ast}'s heads`);
  }
}

/** Trends: from the node to its target evolution, shortened; horizontal unless from a moved parent. */
function checkTrends(ck: Check): void {
  const { model, layout, out } = ck;
  const shorten = layout.nodeRadius + M.trend.gap;
  if (model.trends.filter((t) => ck.nodes.has(t.nodeId)).length !== layout.trends.length)
    out.push('a trend is missing or extra');
  for (const t of layout.trends) {
    const n = ck.nodes.get(t.nodeId);
    const m = model.trends.find((x) => x.astId === t.ast);
    if (!n || !m) continue;
    if (!ck.same(t.from, n.point)) out.push(`trend ${t.ast} does not start at its node`);
    if (!ck.moved.has(t.nodeId) && !ck.near(t.from.y, t.to.y))
      out.push(`trend ${t.ast} is not horizontal`);
    const target = { x: ck.px(m.targetX), y: ck.py(m.targetY) };
    const d = dist(t.from, target);
    if (!ck.near(dist(t.to, target), d > shorten ? shorten : 0))
      out.push(`trend ${t.ast} is not shortened by ${shorten}`);
  }
}

/** Stages (the author's or v12's, inside the chart), the grid, and the annotations box. */
function checkStages(ck: Check): void {
  const { model, layout, out, tol, xs, ys } = ck;
  const names = model.evolution?.stages.length ? model.evolution.stages : DEFAULT_STAGES;
  if (layout.stages.length !== names.length) out.push(`${layout.stages.length} stages`);
  layout.stages.forEach((s, i) => {
    for (const x of [s.start, s.end])
      if (x < xs[0] - tol || x > xs[1] + tol) out.push(`stage ${i} runs outside the chart`);
    if (layout.chart.width >= 0 && s.end < s.start - tol) out.push(`stage ${i} runs backwards`);
    if (i > 0 !== (s.divider !== undefined)) out.push(`stage ${i}'s divider`);
  });
  if (layout.grid.length !== 0 && layout.grid.length !== (M.grid.divisions - 1) * 2)
    out.push(`${layout.grid.length} grid lines`);

  const box = layout.annotationsBox;
  if (!box) return;
  if (!model.annotationsBox || model.annotations.length === 0)
    out.push('an annotations box without annotations');
  const b = box.box;
  const fits = b.width <= layout.chart.width && b.height <= layout.chart.height;
  const outside =
    b.x < xs[0] - tol ||
    b.y < ys[0] - tol ||
    b.x + b.width > xs[1] + tol ||
    b.y + b.height > ys[1] + tol;
  if (fits && outside) out.push('the annotations box is outside the chart');
}

/** Everything drawn inside the bounds (D224). */
function checkBounds(ck: Check): void {
  const { layout, out, tol } = ck;
  const b = layout.bounds;
  const inside = (q: Point, what: string): void => {
    if (
      q.x < b.x - tol ||
      q.y < b.y - tol ||
      q.x > b.x + b.width + tol ||
      q.y > b.y + b.height + tol
    )
      out.push(`${what} is outside the bounds`);
  };
  const disc = (c: Point, radius: number, what: string): void => {
    inside({ x: c.x - radius, y: c.y - radius }, what);
    inside({ x: c.x + radius, y: c.y + radius }, what);
  };
  // The chart is a frame, not a drawing; the fonts and the bounds hold no geometry.
  const { bounds: _b, fonts: _f, chart: _c, ...drawn } = layout;
  void [_b, _f, _c];
  walk(drawn, 'layout', inside);
  for (const n of layout.nodes) {
    disc(n.point, n.radius, `node ${n.id}`);
    if (n.overlay) disc(n.point, n.overlay.radius, `node ${n.id}'s overlay`);
    for (const dot of n.market?.dots ?? []) disc(dot, n.market!.radius, `node ${n.id}'s dots`);
  }
  for (const a of layout.annotations) disc(a.point, a.radius, `annotation ${a.number}`);
}

/**
 * Pairs of texts on top of one another: their drawn boxes (rotation included) overlap by more
 * than a px. The e2e maps must have none (spec #430: "labels never on top of one another for
 * the corpus").
 */
export function wardleyLabelOverlaps(layout: WardleyLayout): string[] {
  const texts: [string, PlacedText][] = [];
  if (layout.title) texts.push(['the title', layout.title]);
  texts.push(['the x axis label', layout.axes.xLabel], ['the y axis label', layout.axes.yLabel]);
  layout.stages.forEach((s, i) => texts.push([`stage ${i}`, s.label]));
  for (const n of layout.nodes) texts.push([`node ${n.id}`, n.label]);
  for (const k of layout.links) if (k.label) texts.push([`link ${k.ast}`, k.label]);
  for (const a of layout.annotations) texts.push([`annotation ${a.number}`, a.label]);
  layout.annotationsBox?.lines.forEach((t, i) => texts.push([`annotations line ${i}`, t]));
  layout.notes.forEach((n) => texts.push([`note ${n.ast}`, n.label]));
  for (const a of [...layout.accelerators, ...layout.deaccelerators])
    texts.push([`accelerator ${a.ast}`, a.label]);
  const shapes = texts
    .filter(([, t]) => t.width > 0 && t.height > 0)
    .map(([what, t]) => [what, textCorners(t)] as const);
  const out: string[] = [];
  for (let i = 0; i < shapes.length; i++)
    for (let j = i + 1; j < shapes.length; j++)
      if (overlap(shapes[i]![1], shapes[j]![1]) > OVERLAP_SLACK)
        out.push(`${shapes[i]![0]} and ${shapes[j]![0]} overlap`);
  return out;
}

/** How deep two convex polygons run into each other: the least overlap over their edge axes. */
function overlap(a: readonly Point[], b: readonly Point[]): number {
  let least = Infinity;
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len === 0) continue;
      const axis = { x: (p.y - q.y) / len, y: (q.x - p.x) / len };
      const [a0, a1] = project(a, axis);
      const [b0, b1] = project(b, axis);
      least = Math.min(least, Math.min(a1, b1) - Math.max(a0, b0));
    }
  return least;
}

function project(poly: readonly Point[], axis: Point): [number, number] {
  const d = poly.map((p) => p.x * axis.x + p.y * axis.y);
  return [Math.min(...d), Math.max(...d)];
}

/** The interval a start and a (maybe negative) length cover. */
function span(start: number, length: number): [number, number] {
  return length >= 0 ? [start, start + length] : [start + length, start];
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** `q` lies on the line through `a` and `b`. */
function onLine(q: Point, a: Point, b: Point, tol: number): boolean {
  const d = dist(a, b);
  return Math.abs((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x)) / d <= tol;
}

/** The distance from `c` to the segment `from`–`to`. */
function toSegment(c: Point, { from: a, to: b }: Segment): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2));
  return dist(c, { x: a.x + t * dx, y: a.y + t * dy });
}

const isText = (v: object): v is PlacedText => 'text' in v && 'at' in v && 'rotate' in v;
const isPoint = (v: object): v is Point =>
  typeof (v as Point).x === 'number' && typeof (v as Point).y === 'number';
const isRect = (v: object): v is Rect =>
  isPoint(v) && typeof (v as Rect).width === 'number' && typeof (v as Rect).height === 'number';

/** Every point, rectangle and text (as drawn, rotation included) in `v`, at any depth. */
function walk(v: unknown, path: string, inside: (p: Point, what: string) => void): void {
  if (Array.isArray(v)) {
    v.forEach((x, i) => walk(x, `${path}[${i}]`, inside));
    return;
  }
  if (v === null || typeof v !== 'object') return;
  if (isText(v)) {
    for (const corner of textCorners(v)) inside(corner, path);
    return;
  }
  if (isRect(v)) inside({ x: v.x + v.width, y: v.y + v.height }, path);
  if (isPoint(v)) inside(v, path);
  for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, inside);
}

/** Every number in `v`, at any depth, is finite. */
function finite(v: unknown, path: string, out: string[]): void {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(`${path} is ${v}`);
  } else if (Array.isArray(v)) v.forEach((x, i) => finite(x, `${path}[${i}]`, out));
  else if (v !== null && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) finite(x, `${path}.${k}`, out);
}
