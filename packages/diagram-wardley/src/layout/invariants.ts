/**
 * The wardley layout's invariants (spec #430 "Testing Decisions", R-LAYOUT-3): what every
 * `WardleyLayout` must satisfy for the model it was laid out from. Empty when the layout is
 * sound; each entry names a broken rule. Exported from `@mermaid-js/diagram-wardley/testing` for
 * the conformance specs, with `wardleyLabelOverlaps`, which they assert on the e2e maps only
 * (v12 places labels where the author says, so a hand-written case may stack them).
 */
import type { WardleyLink, WardleyModel, WardleyNode, WardleyTrend } from '../model.ts';
import { textCorners } from './geometry.ts';
import { DEFAULT_STAGES, WARDLEY_METRICS as metrics } from './metrics.ts';
import type {
  PlacedText,
  Point,
  Rect,
  Segment,
  WardleyLayout,
  WardleyNodeLayout,
} from './types.ts';
import { EPS, nonFinite as finite } from '@mermaid-js/shared/testing/layout-invariants';

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
  /** The drawn nodes and the model's, by id. */
  readonly nodes: ReadonlyMap<string, WardleyNodeLayout>;
  readonly byId: ReadonlyMap<string, WardleyNode>;
  /** The parents a pipeline moved. */
  readonly moved: ReadonlySet<string>;
  readonly square: number;
}

export function wardleyLayoutViolations(model: WardleyModel, layout: WardleyLayout): string[] {
  const out: string[] = [];
  finite(layout, 'layout', out);
  const { width, height, padding, chart } = layout;
  const tol = EPS * Math.max(1, width, height);
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= tol;
  const check: Check = {
    model,
    layout,
    out,
    tol,
    near,
    same: (a, b) => near(a.x, b.x) && near(a.y, b.y),
    px: (v) => padding + (v / 100) * chart.width,
    py: (v) => height - padding - (v / 100) * chart.height,
    nodes: new Map(layout.nodes.map((n) => [n.id, n])),
    byId: new Map(model.nodes.map((n) => [n.id, n])),
    moved: new Set(layout.pipelines.map((q) => q.nodeId)),
    square: layout.nodeRadius * metrics.pipeline.squareFactor,
  };
  // D424: never nothing.
  if (!near(chart.width, width - padding * 2) || !near(chart.height, height - padding * 2))
    out.push('the chart is not the canvas inset by the padding');
  if (!(chart.width > 0 && chart.height > 0)) out.push('the chart is empty');
  if (!(layout.nodeRadius > 0)) out.push('the node radius is not above 0');
  checkNodes(check);
  checkPipelines(check);
  checkLinks(check);
  checkTrends(check);
  checkStages(check);
  checkTexts(check);
  checkBounds(check);
  return out;
}

/** Nodes: one per model node in order, at its projection (in the chart) unless a pipeline moved it. */
function checkNodes(check: Check): void {
  const { model, layout, out, tol } = check;
  const { chart } = layout;
  if (layout.nodes.map((n) => n.id).join('\n') !== model.nodes.map((n) => n.id).join('\n'))
    out.push('the nodes are not the model nodes in order');
  for (const node of model.nodes) {
    const drawn = check.nodes.get(node.id);
    if (!drawn) continue;
    if (!check.moved.has(node.id)) {
      if (!check.same(drawn.point, { x: check.px(node.x), y: check.py(node.y) }))
        out.push(`node ${node.id} is off its position`);
      const inRange = node.x >= 0 && node.x <= 100 && node.y >= 0 && node.y <= 100;
      if (inRange && !insideRect(drawn.point, chart, tol))
        out.push(`node ${node.id} is outside the chart`);
    }
    let glyph = 'circle';
    if (node.isPipelineParent) glyph = 'square';
    else if (node.sourceStrategy === 'market' || node.className === 'anchor') glyph = 'none';
    if (drawn.glyph !== glyph) out.push(`node ${node.id} is drawn as ${drawn.glyph}, not ${glyph}`);
  }
}

/**
 * Pipelines (v12 `:339-378`): the box `pad` past its children and centred on the last child's
 * line, the parent at its centre x and lifted above its top; the children on the parent's line
 * are on it. Named skips: a child that is itself a moved parent (its box was drawn where it
 * stood before the move, and a last such child places the box), and a child merged with
 * another node (it keeps that node's place, `parser-pipeline-id-collision`); when the last
 * child is merged, the box is on its line, not the parent's.
 */
function checkPipelines(check: Check): void {
  const { model, layout, out, tol, near } = check;
  const byParent = new Map(model.pipelines.map((p) => [p.nodeId, p]));
  const pad = metrics.pipeline.pad;
  for (const drawn of layout.pipelines) {
    const { box } = drawn;
    const name = `pipeline ${drawn.nodeId}`;
    const parent = check.nodes.get(drawn.nodeId);
    const pipeline = byParent.get(drawn.nodeId);
    const parentModel = check.byId.get(drawn.nodeId);
    if (!parent || !pipeline || !parentModel) {
      out.push(`${name} is not a model pipeline`);
      continue;
    }
    if (!near(box.height, layout.nodeRadius * metrics.pipeline.heightFactor))
      out.push(`${name}'s box height`);
    const want = { x: box.x + box.width / 2, y: box.y - check.square * metrics.pipeline.lift };
    if (!check.same(parent.point, want)) out.push(`${name}'s parent is not on its box`);
    if (drawn.joins.length !== Math.max(0, pipeline.componentIds.length - 1))
      out.push(`${name} has ${drawn.joins.length} joins`);

    const centre = box.y + box.height / 2;
    const lastId = pipeline.componentIds[pipeline.componentIds.length - 1]!;
    const last = check.nodes.get(lastId);
    if (last && !check.moved.has(lastId) && !near(centre, last.point.y))
      out.push(`${name}'s box is not on its last child's line`);
    const line = check.py(parentModel.y);
    for (const id of pipeline.componentIds) {
      const child = check.nodes.get(id);
      if (!child || check.moved.has(id)) continue;
      const { x } = child.point;
      if (x < box.x + pad - tol || x > box.x + box.width - pad + tol)
        out.push(`${name}: ${id} is outside its box's span`);
      if (check.byId.get(id)?.y !== parentModel.y) continue;
      if (!near(child.point.y, line)) out.push(`${name}: ${id} is off its parent's line`);
    }
  }
}

/**
 * Links: exactly the drawable ones, in order, each end on its own node's edge, on the line
 * between the centres, clear of both circles when the circles are apart; heads by flow.
 */
function checkLinks(check: Check): void {
  const { model, layout, out, tol } = check;
  const children = new Map(model.pipelines.map((q) => [q.nodeId, new Set(q.componentIds)]));
  const edge = (node: WardleyNode): number =>
    node.isPipelineParent ? check.square / Math.SQRT2 : layout.nodeRadius;
  const drawable = model.links.filter((link) => {
    const source = check.nodes.get(link.source);
    const target = check.nodes.get(link.target);
    if (!source || !target || link.source === link.target) return false;
    if (children.get(link.target)?.has(link.source)) return false;
    return !check.same(source.point, target.point);
  });
  const want = drawable.map((link) => link.astId).join();
  const got = layout.links.map((link) => link.ast).join();
  if (want !== got) out.push(`drawn links ${got} for ${want}`);
  const byAst = new Map<string, WardleyLink>(model.links.map((link) => [link.astId, link]));
  for (const link of layout.links) {
    const source = check.nodes.get(link.source);
    const target = check.nodes.get(link.target);
    const sourceModel = check.byId.get(link.source);
    const targetModel = check.byId.get(link.target);
    if (!source || !target || !sourceModel || !targetModel) continue;
    const name = `link ${link.ast}`;
    const fromRadius = edge(sourceModel);
    const toRadius = edge(targetModel);
    if (
      !check.near(dist(link.from, source.point), fromRadius) ||
      !check.near(dist(link.to, target.point), toRadius)
    )
      out.push(`${name}'s ends are not on its nodes' edges`);
    if (!onLine(link.from, source.point, target.point, tol))
      out.push(`${name} leaves the line between its nodes`);
    if (!onLine(link.to, source.point, target.point, tol))
      out.push(`${name} leaves the line between its nodes`);
    const apart = dist(source.point, target.point) >= fromRadius + toRadius;
    if (
      apart &&
      (toSegment(source.point, link) < fromRadius - tol ||
        toSegment(target.point, link) < toRadius - tol)
    )
      out.push(`${name} runs into a node`);
    const flow = byAst.get(link.ast)?.flow;
    const heads = [
      flow === 'backward' || flow === 'bidirectional' ? 'start' : '',
      flow === 'forward' || flow === 'bidirectional' ? 'end' : '',
    ].filter(Boolean);
    if (Object.keys(link.heads).sort().join() !== heads.sort().join()) out.push(`${name}'s heads`);
  }
}

/** Trends: from the node to its target evolution, shortened; horizontal unless from a moved parent. */
function checkTrends(check: Check): void {
  const { model, layout, out } = check;
  const shorten = layout.nodeRadius + metrics.trend.gap;
  if (model.trends.filter((t) => check.nodes.has(t.nodeId)).length !== layout.trends.length)
    out.push('a trend is missing or extra');
  const byAst = new Map<string, WardleyTrend>(model.trends.map((t) => [t.astId, t]));
  for (const trend of layout.trends) {
    const node = check.nodes.get(trend.nodeId);
    const source = byAst.get(trend.ast);
    if (!node || !source) continue;
    const name = `trend ${trend.ast}`;
    if (!check.same(trend.from, node.point)) out.push(`${name} does not start at its node`);
    if (!check.moved.has(trend.nodeId) && !check.near(trend.from.y, trend.to.y))
      out.push(`${name} is not horizontal`);
    const target = { x: check.px(source.targetX), y: check.py(source.targetY) };
    const length = dist(trend.from, target);
    if (!check.near(dist(trend.to, target), length > shorten ? shorten : 0))
      out.push(`${name} is not shortened by ${shorten}`);
  }
}

/**
 * Stages (the author's or v12's, inside the chart; custom boundaries in the author's order, so
 * a stage may run right to left, as in v12), the grid, and the annotations box.
 */
function checkStages(check: Check): void {
  const { model, layout, out, tol } = check;
  const { chart } = layout;
  const names = model.evolution?.stages.length ? model.evolution.stages : DEFAULT_STAGES;
  if (layout.stages.length !== names.length) out.push(`${layout.stages.length} stages`);
  layout.stages.forEach((stage, i) => {
    for (const x of [stage.start, stage.end])
      if (x < chart.x - tol || x > chart.x + chart.width + tol)
        out.push(`stage ${i} runs outside the chart`);
    if (i > 0 && !check.near(stage.start, layout.stages[i - 1]!.end))
      out.push(`stage ${i} does not start where stage ${i - 1} ends`);
    if (i > 0 !== (stage.divider !== undefined)) out.push(`stage ${i}'s divider`);
  });
  if (layout.grid.length !== 0 && layout.grid.length !== (metrics.grid.divisions - 1) * 2)
    out.push(`${layout.grid.length} grid lines`);

  const box = layout.annotationsBox;
  if (!box) return;
  if (!model.annotationsBox || model.annotations.length === 0)
    out.push('an annotations box without annotations');
  const fits = box.box.width <= chart.width && box.box.height <= chart.height;
  const inside =
    insideRect(box.box, chart, tol) &&
    insideRect({ x: box.box.x + box.box.width, y: box.box.y + box.box.height }, chart, tol);
  if (fits && !inside) out.push('the annotations box is outside the chart');
}

/**
 * Every text's box is the size of its laid-out lines (an empty text one line high), and its
 * plain text is theirs (#1368).
 */
function checkTexts(check: Check): void {
  const { near } = check;
  for (const [what, t] of textsOf(check.layout)) {
    const { label } = t;
    const lines = label.lines.map((line) => line.map((run) => run.text).join('')).join('\n');
    if (
      !near(t.width, label.width) ||
      !near(t.height, Math.max(label.height, label.lineHeight)) ||
      t.text !== lines
    )
      check.out.push(`${what} is not the size of its lines`);
  }
}

/** Everything drawn inside the bounds (D224). */
function checkBounds(check: Check): void {
  const { layout, out, tol } = check;
  const inside = (q: Point, what: string): void => {
    if (!insideRect(q, layout.bounds, tol)) out.push(`${what} is outside the bounds`);
  };
  const disc = (centre: Point, radius: number, what: string): void => {
    inside({ x: centre.x - radius, y: centre.y - radius }, what);
    inside({ x: centre.x + radius, y: centre.y + radius }, what);
  };
  // The chart is a frame, not a drawing; the fonts and the bounds hold no geometry.
  const { bounds: _bounds, fonts: _fonts, chart: _chart, ...drawn } = layout;
  void [_bounds, _fonts, _chart];
  walk(drawn, 'layout', inside);
  for (const node of layout.nodes) {
    disc(node.point, node.radius, `node ${node.id}`);
    if (node.overlay) disc(node.point, node.overlay.radius, `node ${node.id}'s overlay`);
    for (const dot of node.market?.dots ?? [])
      disc(dot, node.market!.radius, `node ${node.id}'s dots`);
  }
  for (const a of layout.annotations) disc(a.point, a.radius, `annotation ${a.number}`);
}

/** Every text of a layout, named. */
function textsOf(layout: WardleyLayout): [string, PlacedText][] {
  const texts: [string, PlacedText][] = [];
  if (layout.title) texts.push(['the title', layout.title]);
  texts.push(['the x axis label', layout.axes.xLabel], ['the y axis label', layout.axes.yLabel]);
  layout.stages.forEach((s, i) => texts.push([`stage ${i}`, s.label]));
  for (const node of layout.nodes) texts.push([`node ${node.id}`, node.label]);
  for (const link of layout.links) if (link.label) texts.push([`link ${link.ast}`, link.label]);
  for (const a of layout.annotations) texts.push([`annotation ${a.number}`, a.label]);
  layout.annotationsBox?.lines.forEach((t, i) => texts.push([`annotations line ${i}`, t]));
  for (const note of layout.notes) texts.push([`note ${note.ast}`, note.label]);
  for (const a of [...layout.accelerators, ...layout.deaccelerators])
    texts.push([`accelerator ${a.ast}`, a.label]);
  return texts;
}

/**
 * Pairs of texts on top of one another: their drawn boxes (rotation included) overlap by more
 * than a px. The e2e maps must have none (spec #430: "labels never on top of one another for
 * the corpus").
 */
export function wardleyLabelOverlaps(layout: WardleyLayout): string[] {
  const shapes = textsOf(layout)
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

/** `q` lies inside `r`, within `tol`. */
function insideRect(q: Point, r: Rect, tol: number): boolean {
  return (
    q.x >= r.x - tol &&
    q.y >= r.y - tol &&
    q.x <= r.x + r.width + tol &&
    q.y <= r.y + r.height + tol
  );
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
