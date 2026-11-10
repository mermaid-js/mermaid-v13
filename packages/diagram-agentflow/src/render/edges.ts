// Edge paths from layout routes, and inline end markers (no <defs>/<marker>, DESIGN §7.1): a
// local copy of v13 flowchart's `edges.ts` (D446), itself ported from Pele's src/svg/edges.ts
// @ 3a2f075 (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano): `routePath`, `marker`,
// `markerTrim`, with agentflow's two heads (point and cross; `-.-` has none).
// cspell:ignore kepano
import type { RoutePoint } from '@mermaid-js/core/layout';
import type { Attrs, PathData, SvgWriter } from '@mermaid-js/core/svg';
import type { Theme } from '@mermaid-js/core/theme';
import type { Arrowhead, CurveKind } from '../layout/index.ts';

/**
 * Arrowhead geometry for one render, from the theme (D152). A gap is the space between the
 * node outline and the nearest point of the arrowhead.
 */
export interface Arrowheads {
  readonly gap: number;
  readonly length: number;
  readonly width: number;
  readonly crossSize: number;
  readonly crossGap: number;
  readonly crossStrokeWidth: number;
}

/** Reads the arrowhead variables as numbers (they never become CSS variables). */
export function arrowheads(theme: Theme): Arrowheads {
  return {
    gap: theme.number('arrowheadGap'),
    length: theme.number('arrowheadLength'),
    width: theme.number('arrowheadWidth'),
    crossSize: theme.number('crossArrowheadSize'),
    crossGap: theme.number('crossArrowheadGap'),
    crossStrokeWidth: theme.number('crossArrowheadStrokeWidth'),
  };
}

// How far an edge runs straight before a marker at its end, where it has the room.
const LEAD = 6;
// The most a corner is rounded by in a stepped route.
const STEP_CORNER = 12;
// The radius of the arc at a corner of a rounded route (v12's `rounded` curve), less where a
// leg is too short for it.
const RADIUS = 5;
// How far the handles of a wide turn reach along its two legs.
const HANDLE = 0.62;

export interface EdgePath {
  d: PathData;
  /** Start tip and the way a start marker points. */
  sx: number;
  sy: number;
  sdx: number;
  sdy: number;
  /** End tip and the way an end marker points. */
  ex: number;
  ey: number;
  edx: number;
  edy: number;
}

// The S-curve handle factor of the layered engine's `ease`.
const ease = (across: number, along: number): number =>
  Math.max(0.25, Math.min(0.5, (4 * Math.abs(along)) / (Math.abs(across) || 1)));

// Where a step curve turns between two coordinates: at the start, the end or halfway.
function stepCorner(kind: CurveKind, from: number, to: number): number {
  if (kind === 'stepBefore') return from;
  if (kind === 'stepAfter') return to;
  return (from + to) / 2;
}

const near = (ax: number, ay: number, bx: number, by: number): boolean =>
  Math.abs(ax - bx) < 0.01 && Math.abs(ay - by) < 0.01;

/** A route's points (stepped routes with their turns added) and the tests on its legs. */
class Legs {
  readonly xs: number[] = [];
  readonly ys: number[] = [];
  /** 1 where the point's leg runs across (`axis: 'h'`), else 0. */
  readonly axes: number[] = [];
  last = 0;
  /** The unit vector {@link unit} found. */
  ux = 0;
  uy = 0;
  private readonly linear: boolean;

  constructor(
    readonly kind: CurveKind,
    route: readonly RoutePoint[]
  ) {
    this.linear = kind === 'linear';
    const stepped = kind === 'step' || kind === 'stepBefore' || kind === 'stepAfter';
    const { xs, ys, axes } = this;
    for (const p of route) {
      const axis = p.axis === 'h' ? 1 : 0;
      const last = xs.length - 1;
      if (
        stepped &&
        last >= 0 &&
        Math.abs(p.x - xs[last]!) >= 0.01 &&
        Math.abs(p.y - ys[last]!) >= 0.01
      ) {
        const px = xs[last]!;
        const py = ys[last]!;
        // The turn: across then along, or along then across.
        const tx = axis === 0 ? px : stepCorner(kind, px, p.x);
        const ty = axis === 0 ? stepCorner(kind, py, p.y) : py;
        const ux = axis === 0 ? p.x : tx;
        const uy = axis === 0 ? ty : p.y;
        this.turn(tx, ty, px, py, p, axis);
        this.turn(ux, uy, px, py, p, axis);
      }
      xs.push(p.x);
      ys.push(p.y);
      axes.push(axis);
    }
    this.last = xs.length - 1;
  }

  private turn(x: number, y: number, px: number, py: number, p: RoutePoint, axis: number): void {
    if (near(x, y, px, py) || near(x, y, p.x, p.y)) return;
    this.xs.push(x);
    this.ys.push(y);
    this.axes.push(axis);
  }

  x(i: number): number {
    return this.xs[i]!;
  }

  y(i: number): number {
    return this.ys[i]!;
  }

  aligned(i: number): boolean {
    return Math.abs(this.x(i) - this.x(i - 1)) < 0.01 || Math.abs(this.y(i) - this.y(i - 1)) < 0.01;
  }

  straight(i: number): boolean {
    return this.linear || this.kind === 'rounded' || this.aligned(i);
  }

  /** Sets ({@link ux}, {@link uy}) to the way the line leaves point i towards point j. */
  unit(i: number, j: number, axis: number): void {
    if (!this.straight(Math.max(i, j))) {
      this.ux = axis === 0 ? 0 : Math.sign(this.x(j) - this.x(i)) || 1;
      this.uy = axis === 0 ? Math.sign(this.y(j) - this.y(i)) || 1 : 0;
      return;
    }
    const dx = this.x(j) - this.x(i);
    const dy = this.y(j) - this.y(i);
    const len = Math.hypot(dx, dy) || 1;
    this.ux = dx / len;
    this.uy = dy / len;
  }

  length(i: number): number {
    return Math.abs(this.x(i) - this.x(i - 1)) + Math.abs(this.y(i) - this.y(i - 1));
  }

  /** Whether the route turns a right angle at point i. */
  turns(i: number): boolean {
    return (
      !this.linear &&
      i > 0 &&
      i < this.last &&
      this.aligned(i) &&
      this.aligned(i + 1) &&
      this.length(i) >= 0.01 &&
      this.length(i + 1) >= 0.01 &&
      Math.abs(this.x(i) - this.x(i - 1)) < 0.01 !== Math.abs(this.x(i + 1) - this.x(i)) < 0.01
    );
  }

  /** How far leg i runs along (ux, uy). */
  along(i: number, ux: number, uy: number): number {
    return (
      Math.abs(this.x(i) - this.x(i - 1)) * Math.abs(ux) +
      Math.abs(this.y(i) - this.y(i - 1)) * Math.abs(uy)
    );
  }

  insert(at: number, x: number, y: number, axis: number): void {
    this.xs.splice(at, 0, x);
    this.ys.splice(at, 0, y);
    this.axes.splice(at, 0, axis);
    this.last++;
  }
}

// A curve into a marker runs straight for a little way first, where there is room.
const lead = (run: number): number => Math.min(LEAD, run / 4);

/**
 * The path for a route, trimmed at both ends to leave room for markers. Between two points
 * not in line the route is one S along the flow (or a step in a stepped route); where the
 * route turns a corner it is rounded.
 */
export function routePath(
  w: SvgWriter,
  route: readonly RoutePoint[],
  kind: CurveKind,
  startTrim: number,
  endTrim: number
): EdgePath {
  const r = new Legs(kind, route);
  const { xs, ys, axes } = r;
  let last = r.last;
  r.unit(0, 1, axes[1] ?? 0);
  const sdx = r.ux;
  const sdy = r.uy;
  r.unit(last - 1, last, axes[last] ?? 0);
  const edx = r.ux;
  const edy = r.uy;
  const sx = r.x(0);
  const sy = r.y(0);
  const ex = r.x(last);
  const ey = r.y(last);
  xs[0] = sx + sdx * startTrim;
  ys[0] = sy + sdy * startTrim;
  xs[last] = ex - edx * endTrim;
  ys[last] = ey - edy * endTrim;
  const arrives =
    endTrim > 0 && (!r.straight(last) || r.turns(last - 1)) ? lead(r.along(last, edx, edy)) : 0;
  const leaves = startTrim > 0 && (!r.straight(1) || r.turns(1)) ? lead(r.along(1, sdx, sdy)) : 0;
  if (arrives >= 1) {
    r.insert(last, r.x(last) - edx * arrives, r.y(last) - edy * arrives, axes[last]!);
    last++;
  }
  if (leaves >= 1) {
    r.insert(1, r.x(0) + sdx * leaves, r.y(0) + sdy * leaves, axes[1]!);
    last++;
  }
  return { d: draw(w, r, kind), sx, sy, sdx: -sdx, sdy: -sdy, ex, ey, edx, edy };
}

/** The path data through a route's points: S-curves between offset points, corners rounded. */
function draw(w: SvgWriter, r: Legs, kind: CurveKind): PathData {
  const cornered =
    kind === 'step' || kind === 'stepBefore' || kind === 'stepAfter' || kind === 'rounded';
  const last = r.last;
  const b = w.path().moveTo(r.x(0), r.y(0));
  let atX = r.x(0);
  let atY = r.y(0);
  const lineTo = (x: number, y: number): void => {
    if (near(x, y, atX, atY)) return;
    b.lineTo(x, y);
    atX = x;
    atY = y;
  };
  for (let i = 1; i <= last; i++) {
    const x = r.x(i);
    const y = r.y(i);
    if (!r.straight(i)) {
      const down = r.axes[i] === 0;
      const run = down ? y - atY : x - atX;
      const k = Math.abs(run) * ease(down ? x - atX : y - atY, run);
      const ux = down ? 0 : Math.sign(run) * k;
      const uy = down ? Math.sign(run) * k : 0;
      b.curveTo(atX + ux, atY + uy, x - ux, y - uy, x, y);
      atX = x;
      atY = y;
      continue;
    }
    if (!r.turns(i)) {
      // A point part of the way along one straight run adds nothing.
      if (
        i < last &&
        r.aligned(i) &&
        r.aligned(i + 1) &&
        (x - r.x(i - 1)) * (r.x(i + 1) - x) + (y - r.y(i - 1)) * (r.y(i + 1) - y) > 0
      )
        continue;
      lineTo(x, y);
      continue;
    }
    let before = r.turns(i - 1) ? r.length(i) / 2 : r.length(i);
    let after = r.turns(i + 1) ? r.length(i + 1) / 2 : r.length(i + 1);
    if (cornered) {
      before = after = Math.min(kind === 'rounded' ? RADIUS : STEP_CORNER, before, after);
    }
    r.unit(i - 1, i, r.axes[i]!);
    const ux = r.ux;
    const uy = r.uy;
    r.unit(i, i + 1, r.axes[i + 1]!);
    const vx = r.ux;
    const vy = r.uy;
    lineTo(x - ux * before, y - uy * before);
    atX = x + vx * after;
    atY = y + vy * after;
    // A right-angle turn, so the arc's radius is its leg; the sweep follows the turn (y down).
    if (kind === 'rounded') b.arcTo(before, before, 0, false, ux * vy - uy * vx > 0, atX, atY);
    else if (cornered) b.quadTo(x, y, atX, atY);
    else {
      b.curveTo(
        x - ux * before * (1 - HANDLE),
        y - uy * before * (1 - HANDLE),
        x + vx * after * (1 - HANDLE),
        y + vy * after * (1 - HANDLE),
        atX,
        atY
      );
    }
  }
  return b.done();
}

/** Where a line meets a node outline, and the unit direction it travels there. */
export interface LineEnd {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** One v12 arrowhead type: how far it shortens the line, and how it is drawn. */
interface HeadKind {
  /**
   * How far the line stops short of the node outline: past the gap and under the arrowhead,
   * so the line never shows between the tip and the node. That also keeps dashed and dotted
   * lines from needing a special case.
   */
  trim(g: Arrowheads): number;
  /** Draws the arrowhead for a line meeting the outline at (x, y), pointing along (dx, dy). */
  draw(w: SvgWriter, tip: LineEnd, paint: Attrs, g: Arrowheads): void;
}

const HEADS: ReadonlyMap<Arrowhead, HeadKind> = /* @__PURE__ */ new Map<Arrowhead, HeadKind>([
  [
    'arrow_point',
    {
      trim: (g) => g.gap + Math.max(0, g.length - 1),
      draw(w, { x, y, dx, dy }, paint, g) {
        const tipX = x - dx * g.gap;
        const tipY = y - dy * g.gap;
        const baseX = tipX - dx * g.length;
        const baseY = tipY - dy * g.length;
        // Half the base, across the line.
        const acrossX = -dy * (g.width / 2);
        const acrossY = dx * (g.width / 2);
        const d = w
          .path()
          .moveTo(tipX, tipY)
          .lineTo(baseX + acrossX, baseY + acrossY)
          .lineTo(baseX - acrossX, baseY - acrossY)
          .close()
          .done();
        w.leaf('path', { class: 'marker', d, ...paint, stroke: 'none' });
      },
    },
  ],
  [
    'arrow_cross',
    {
      trim: (g) => g.crossGap + g.crossSize / 2,
      // The arms are the diagonals of a square of side `crossSize`, `crossGap` from the outline.
      draw(w, { x, y, dx, dy }, paint, g) {
        const half = g.crossSize / 2;
        const cx = x - dx * (g.crossGap + half);
        const cy = y - dy * (g.crossGap + half);
        // Half of each diagonal: along the line plus or minus across it.
        const ux = (dx - dy) * half;
        const uy = (dy + dx) * half;
        const vx = (dx + dy) * half;
        const vy = (dy - dx) * half;
        const d = w
          .path()
          .moveTo(cx - ux, cy - uy)
          .lineTo(cx + ux, cy + uy)
          .moveTo(cx - vx, cy - vy)
          .lineTo(cx + vx, cy + vy)
          .done();
        w.leaf('path', {
          class: 'marker',
          d,
          stroke: paint.fill,
          'stroke-width': g.crossStrokeWidth,
        });
      },
    },
  ],
]);

/** How far an end marker of this v12 type shortens the line from the node outline. */
export const markerTrim = (type: Arrowhead, geometry: Arrowheads): number =>
  HEADS.get(type)?.trim(geometry) ?? 0;

/**
 * Draws a v12 end marker for a line that meets the node outline at `end` (x, y), pointing
 * along (dx, dy). The marker sits its gap before the outline; `paint` gives its colour as `fill`.
 */
export function marker(
  w: SvgWriter,
  type: Arrowhead,
  end: LineEnd,
  paint: Attrs,
  geometry: Arrowheads
): void {
  HEADS.get(type)?.draw(w, end, paint, geometry);
}
