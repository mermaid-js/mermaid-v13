// Transition paths from layout routes, and the inline point arrowhead (no <defs>/<marker>,
// DESIGN §7.1). The route drawing follows the flowchart renderer's `routePath` (itself from Pele,
// https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano), cut down to the two curves state
// draws: S-curves along the flow, and a rounded self-loop. A diagram package cannot import
// another (isolation), so this is a copy, not a share.
// cspell:ignore kepano
import type { RoutePoint } from '@mermaid-js/core/layout';
import type { Attrs, PathData, SvgWriter } from '@mermaid-js/core/svg';
import type { Theme } from '@mermaid-js/core/theme';

/** The point arrowhead's geometry for one render, from the theme (D152). */
export interface Arrowhead {
  /** Space between the node outline and the arrowhead's tip. */
  readonly gap: number;
  readonly length: number;
  readonly width: number;
}

/** Reads the arrowhead variables as numbers (they never become CSS variables). */
export function arrowhead(theme: Theme): Arrowhead {
  return {
    gap: theme.number('arrowheadGap'),
    length: theme.number('arrowheadLength'),
    width: theme.number('arrowheadWidth'),
  };
}

/** How far the line stops short of the outline: past the gap and under the arrowhead. */
export const arrowTrim = (g: Arrowhead): number => g.gap + Math.max(0, g.length - 1);

// How far an edge runs straight before an arrowhead at its end, where it has the room.
const LEAD = 6;
// The radius of the arc at a corner of a rounded route, less where a leg is too short for it.
const RADIUS = 5;
// How far the handles of a wide turn reach along its two legs.
const HANDLE = 0.62;

export type CurveKind = 'curved' | 'rounded';

export interface EdgePath {
  d: PathData;
  /** End tip and the way the arrowhead points. */
  ex: number;
  ey: number;
  edx: number;
  edy: number;
}

// The S-curve handle factor of the layered engine's `ease`.
const ease = (across: number, along: number): number =>
  Math.max(0.25, Math.min(0.5, (4 * Math.abs(along)) / (Math.abs(across) || 1)));

const near = (ax: number, ay: number, bx: number, by: number): boolean =>
  Math.abs(ax - bx) < 0.01 && Math.abs(ay - by) < 0.01;

/** A route's points and the tests on its legs. */
class Legs {
  readonly xs: number[] = [];
  readonly ys: number[] = [];
  /** 1 where the point's leg runs across (`axis: 'h'`), else 0. */
  readonly axes: number[] = [];
  last = 0;
  ux = 0;
  uy = 0;

  constructor(
    readonly kind: CurveKind,
    route: readonly RoutePoint[]
  ) {
    for (const p of route) {
      this.xs.push(p.x);
      this.ys.push(p.y);
      this.axes.push(p.axis === 'h' ? 1 : 0);
    }
    this.last = this.xs.length - 1;
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
    return this.kind === 'rounded' || this.aligned(i);
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
      i > 0 &&
      i < this.last &&
      this.aligned(i) &&
      this.aligned(i + 1) &&
      this.length(i) >= 0.01 &&
      this.length(i + 1) >= 0.01 &&
      Math.abs(this.x(i) - this.x(i - 1)) < 0.01 !== Math.abs(this.x(i + 1) - this.x(i)) < 0.01
    );
  }

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

/** The path for a route, trimmed at its end to leave room for an arrowhead. */
export function routePath(
  w: SvgWriter,
  route: readonly RoutePoint[],
  kind: CurveKind,
  endTrim: number
): EdgePath {
  const r = new Legs(kind, route);
  const { xs, ys, axes } = r;
  const last = r.last;
  r.unit(last - 1, last, axes[last] ?? 0);
  const edx = r.ux;
  const edy = r.uy;
  const ex = r.x(last);
  const ey = r.y(last);
  xs[last] = ex - edx * endTrim;
  ys[last] = ey - edy * endTrim;
  const arrives =
    endTrim > 0 && (!r.straight(last) || r.turns(last - 1))
      ? Math.min(LEAD, r.along(last, edx, edy) / 4)
      : 0;
  if (arrives >= 1)
    r.insert(last, r.x(last) - edx * arrives, r.y(last) - edy * arrives, axes[last]!);
  return { d: draw(w, r), ex, ey, edx, edy };
}

/** The path data through a route's points: S-curves between offset points, corners rounded. */
function draw(w: SvgWriter, r: Legs): PathData {
  const rounded = r.kind === 'rounded';
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
    if (rounded) before = after = Math.min(RADIUS, before, after);
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
    if (rounded) b.arcTo(before, before, 0, false, ux * vy - uy * vx > 0, atX, atY);
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

/**
 * The point arrowhead for a line meeting the outline at (x, y) along (dx, dy); it sits its gap
 * before the outline. `paint` gives its colour as `fill`.
 */
export function drawArrowhead(
  w: SvgWriter,
  { ex: x, ey: y, edx: dx, edy: dy }: EdgePath,
  paint: Attrs,
  g: Arrowhead
): void {
  const tipX = x - dx * g.gap;
  const tipY = y - dy * g.gap;
  const baseX = tipX - dx * g.length;
  const baseY = tipY - dy * g.length;
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
}
