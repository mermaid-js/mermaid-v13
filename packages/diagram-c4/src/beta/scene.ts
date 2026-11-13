/**
 * c4-beta layout, second half (spec #730 §Layout, Scene): the engine's `LayoutModel` (centres)
 * becomes the package's `C4Layout` (top-left corners, one frame from (0, 0), the margin all
 * round and the title row above), so the painters legacy C4 draws with can draw it. Engine
 * points become paths, label centres become boxes on the page background, and the canvas is
 * everything drawn (D224).
 *
 * In the scene of a c4-beta diagram, an element's `index` is its place in
 * `C4BetaModel.elements`; a boundary's `index` and `parent` count the boundaries alone, in that
 * order (-1 at the top level).
 */
import type { LayoutModel, RoutePoint } from '@mermaid-js/core/layout';
import { placed, type Measured } from '../layout/layout.ts';
import { C4_METRICS as M } from '../layout/metrics.ts';
import type {
  C4BoundaryLayout,
  C4ElementLayout,
  C4Layout,
  C4RelationEnd,
  C4RelationLayout,
  PlacedLabel,
  Point,
  Rect,
} from '../layout/types.ts';
import { headerCentre, blockedStretches } from './headers.ts';
import { C4_BETA_METRICS as B } from './metrics.ts';
import { labelBlock, legacyKind, type BetaEdge, type C4BetaPrepared } from './prepare.ts';

/** The move from the engine's frame onto the canvas. */
interface Shift {
  readonly ox: number;
  readonly oy: number;
}

/** A box from the engine's centre and size. */
const rectOf = (c: { x: number; y: number; width: number; height: number }): Rect => ({
  x: c.x - c.width / 2,
  y: c.y - c.height / 2,
  width: c.width,
  height: c.height,
});

const moved = (r: Rect, { ox, oy }: Shift): Rect => ({ ...r, x: r.x + ox, y: r.y + oy });

/** Everything drawn in the engine's frame, as x0, y0, x1, y1 (zeros when nothing is). */
function extent(p: C4BetaPrepared, laid: LayoutModel): readonly [number, number, number, number] {
  const boxes: Rect[] = [...laid.groups.values(), ...laid.nodes.values()].map(rectOf);
  const points: Point[] = [];
  for (const edge of p.edges) {
    const e = laid.edges.get(edge.id);
    if (!e) continue;
    points.push(...e.points);
    const block = labelBlock(edge);
    if (e.label && block) boxes.push(rectOf({ ...e.label, ...block }));
  }
  if (boxes.length + points.length === 0) return [0, 0, 0, 0];
  const xs = [...boxes.flatMap((b) => [b.x, b.x + b.width]), ...points.map((q) => q.x)];
  const ys = [...boxes.flatMap((b) => [b.y, b.y + b.height]), ...points.map((q) => q.y)];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function leafOut(p: C4BetaPrepared, laid: LayoutModel, s: Shift): C4ElementLayout[] {
  return p.model.elements.flatMap((element, index) => {
    const leaf = p.leaves.get(element.id);
    const node = laid.nodes.get(element.id);
    if (!leaf || !node) return [];
    const box = moved(rectOf(node), s);
    const centreX = box.x + box.width / 2 + leaf.dx;
    let y = box.y + box.height / 2 + leaf.dy - leaf.textH / 2;
    const [name, type, descr] = leaf.sections.map((m) => {
      if (!m) return undefined;
      const out = placed(m, centreX - m.text.width / 2, y);
      y += m.text.height + M.sectionGap;
      return out;
    });
    return [
      {
        ast: element.ast,
        alias: element.id,
        kind: legacyKind(element),
        index,
        shape: leaf.form,
        box,
        ...(name ? { name } : {}),
        type: type!,
        ...(descr ? { descr } : {}),
      },
    ];
  });
}

function boundaryOut(
  p: C4BetaPrepared,
  laid: LayoutModel,
  s: Shift,
  relations: readonly C4RelationLayout[]
): C4BoundaryLayout[] {
  const lines = relations.map((r) => r.points);
  const labels = relations.flatMap((r) => (r.labelBox ? [r.labelBox] : []));
  const order = p.model.elements.filter((e) => e.boundary);
  const index = new Map(order.map((e, i) => [e.id, i]));
  const depth = new Map<string, number>();
  return order.flatMap((element, i) => {
    const frame = p.frames.get(element.id);
    const group = laid.groups.get(element.id);
    if (!frame || !group) return [];
    const parent = element.parent === undefined ? -1 : (index.get(element.parent) ?? -1);
    const level = parent < 0 ? 0 : depth.get(order[parent]!.id)! + 1;
    depth.set(element.id, level);
    const box = moved(rectOf(group), s);
    const top = box.y + M.boundaryLabelTop;
    const width = Math.max(0, ...frame.header.map((m) => m?.text.width ?? 0));
    const centre = headerCentre(
      [box.x + M.boundaryHeadPadX, box.x + box.width - M.boundaryHeadPadX],
      width,
      blockedStretches(lines, labels, [top, box.y + frame.head - B.headGap]),
      box.x + box.width / 2
    );
    let y = top;
    const gaps = [0, M.boundaryTypeGap, M.boundaryDescrGap];
    const [label, type, descr] = frame.header.map((m, k) => {
      if (!m) return undefined;
      y += gaps[k]!;
      const out = placed(m, centre - m.text.width / 2, y);
      y += m.text.height;
      return out;
    });
    return [
      {
        ast: element.ast,
        alias: element.id,
        index: i,
        parent,
        depth: level,
        box,
        ...(label ? { label } : {}),
        ...(type ? { type } : {}),
        ...(descr ? { descr } : {}),
        head: frame.head,
      },
    ];
  });
}

/** The route's corners: points that lie on the line between their neighbours are dropped. */
function corners(points: readonly Point[]): Point[] {
  return points.filter((q, i) => {
    const a = points[i - 1];
    const b = points[i + 1];
    if (!a || !b) return true;
    return (q.x - a.x) * (b.y - q.y) - (q.y - a.y) * (b.x - q.x) !== 0;
  });
}

/** The unit vector from `a` to `b`; (0, 0) for one point. */
function unit(a: Point, b: Point): Point {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return d === 0 ? { x: 0, y: 0 } : { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
}

/** An arrowhead at `at` points the way `from` leads to it. */
const endAt = (at: Point, from: Point): C4RelationEnd => {
  const d = unit(from, at);
  return { x: at.x, y: at.y, dx: d.x, dy: d.y };
};

/** v12's kind for the heads a relation has: `birel` both ends, `rel_b` the start, else `rel`. */
function relationKind(startArrow: boolean, endArrow: boolean): string {
  if (!startArrow) return 'rel';
  return endArrow ? 'birel' : 'rel_b';
}

function relationOut(edge: BetaEdge, laid: LayoutModel, s: Shift): C4RelationLayout | undefined {
  const e = laid.edges.get(edge.id);
  if (!e || e.points.length < 2) return undefined;
  const pts = corners(e.points.map((q: RoutePoint): Point => ({ x: q.x + s.ox, y: q.y + s.oy })));
  const n = pts.length;
  const { relation } = edge;
  const startArrow = relation.start === 'arrow';
  const endArrow = relation.end === 'arrow';
  const block = labelBlock(edge);
  const stack = (): { label?: PlacedLabel; techn?: PlacedLabel; labelBox: Rect } => {
    const box = moved(rectOf({ ...e.label!, ...block! }), s);
    const at = (m: Measured | undefined, y: number): PlacedLabel | undefined =>
      m && placed(m, box.x + (box.width - m.text.width) / 2, y);
    const label = at(edge.label, box.y);
    const techn = at(edge.techn, box.y + (edge.label?.text.height ?? 0));
    return { ...(label ? { label } : {}), ...(techn ? { techn } : {}), labelBox: box };
  };
  return {
    ast: relation.ast,
    index: edge.index,
    kind: relationKind(startArrow, endArrow),
    from: relation.from,
    to: relation.to,
    route: n === 2 ? 'line' : 'bent',
    points: pts,
    start: endAt(pts[0]!, pts[1]!),
    end: endAt(pts[n - 1]!, pts[n - 2]!),
    startArrow,
    endArrow,
    ...(e.label && block ? stack() : {}),
  };
}

const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

/** The scene of `laid`, the engine's answer for `p.graph`. */
export function placeC4Beta(p: C4BetaPrepared, laid: LayoutModel): C4Layout {
  const [x0, y0, x1, y1] = extent(p, laid);
  const margin = p.diagramPadding;
  const contentW = Math.max(x1 - x0, p.title?.text.width ?? 0);
  const titleRow = p.title ? M.titleRow : 0;
  const shift: Shift = { ox: margin - x0 + (contentW - (x1 - x0)) / 2, oy: margin + titleRow - y0 };
  const title =
    p.title &&
    placed(
      p.title,
      margin + (contentW - p.title.text.width) / 2,
      margin + (titleRow - p.title.text.height) / 2
    );
  const content: Rect = { x: margin, y: margin + titleRow, width: contentW, height: y1 - y0 };
  const relations = p.edges.flatMap((edge) => relationOut(edge, laid, shift) ?? []);
  return {
    width: contentW + 2 * margin,
    height: titleRow + (y1 - y0) + 2 * margin,
    ...(title ? { title } : {}),
    boundaries: boundaryOut(p, laid, shift, relations),
    elements: leafOut(p, laid, shift),
    relations,
    bounds: title ? union(content, title) : content,
    careful: true,
    ...(p.config.wrapAll ? { labelsWrap: true as const } : {}),
  };
}
