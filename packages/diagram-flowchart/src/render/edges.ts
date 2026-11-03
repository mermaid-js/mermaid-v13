// Edge paths from layout routes, and inline end markers (no <defs>/<marker>, DESIGN §7.1).
// Ported from Pele's src/svg/edges.ts @ 3a2f075 (https://github.com/obsidianmd/pele, MIT,
// (c) 2026 kepano): `routePath`, `marker`, `markerTrim`. The fill-aware casings are left out.
// cspell:ignore kepano
import type { RoutePoint } from '@mermaid-js/core/layout';
import type { Attrs, PathData, SvgWriter } from '@mermaid-js/core/svg';
import type { Theme } from '@mermaid-js/core/theme';

/**
 * Arrowhead geometry for one render, from the theme (D152). A gap is the space between the
 * node outline and the nearest point of the arrowhead.
 */
export interface Arrowheads {
  readonly gap: number;
  readonly length: number;
  readonly width: number;
  readonly circleSize: number;
  readonly circleGap: number;
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
    circleSize: theme.number('circleArrowheadSize'),
    circleGap: theme.number('circleArrowheadGap'),
    crossSize: theme.number('crossArrowheadSize'),
    crossGap: theme.number('crossArrowheadGap'),
    crossStrokeWidth: theme.number('crossArrowheadStrokeWidth'),
  };
}

// How far an edge runs straight before a marker at its end, where it has the room.
const LEAD = 6;
// The most a corner is rounded by in a stepped route.
const CORNER = 12;
// The radius of the arc at a corner of a rounded route (v12's `rounded` curve), less where a
// leg is too short for it.
const RADIUS = 5;
// How far the handles of a wide turn reach along its two legs.
const HANDLE = 0.62;

/** How the line between two route points is drawn, from the v12 `curve` name. */
export type CurveKind = 'curved' | 'linear' | 'step' | 'stepBefore' | 'stepAfter' | 'rounded';

export function curveKind(curve: string | undefined): CurveKind {
  return curve === 'linear' ||
    curve === 'step' ||
    curve === 'stepBefore' ||
    curve === 'stepAfter' ||
    curve === 'rounded'
    ? curve
    : 'curved';
}

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

/**
 * The path for a route, trimmed at both ends to leave room for markers. Between two points
 * not in line the route is one S along the flow (or a step in a stepped route); where the
 * route turns a corner it is rounded.
 */
// Where a step curve turns between two coordinates: at the start, the end or halfway.
function stepCorner(kind: CurveKind, from: number, to: number): number {
  if (kind === 'stepBefore') return from;
  if (kind === 'stepAfter') return to;
  return (from + to) / 2;
}

export function routePath(
  w: SvgWriter,
  route: readonly RoutePoint[],
  kind: CurveKind,
  startTrim: number,
  endTrim: number
): EdgePath {
  const linear = kind === 'linear';
  const stepped = kind === 'step' || kind === 'stepBefore' || kind === 'stepAfter';
  const cornered = stepped || kind === 'rounded';
  const xs: number[] = [];
  const ys: number[] = [];
  const axes: number[] = [];
  const near = (ax: number, ay: number, bx: number, by: number): boolean =>
    Math.abs(ax - bx) < 0.01 && Math.abs(ay - by) < 0.01;
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
      const my = stepCorner(kind, py, p.y);
      const mx = stepCorner(kind, px, p.x);
      const turns = axis === 0 ? [px, my, p.x, my] : [mx, py, mx, p.y];
      for (let k = 0; k < 4; k += 2) {
        if (near(turns[k]!, turns[k + 1]!, px, py) || near(turns[k]!, turns[k + 1]!, p.x, p.y))
          continue;
        xs.push(turns[k]!);
        ys.push(turns[k + 1]!);
        axes.push(axis);
      }
    }
    xs.push(p.x);
    ys.push(p.y);
    axes.push(axis);
  }
  let last = xs.length - 1;
  const X = (i: number): number => xs[i]!;
  const Y = (i: number): number => ys[i]!;
  const aligned = (i: number): boolean =>
    Math.abs(X(i) - X(i - 1)) < 0.01 || Math.abs(Y(i) - Y(i - 1)) < 0.01;
  const straight = (i: number): boolean => linear || kind === 'rounded' || aligned(i);
  const unit = (i: number, j: number, axis: number): [number, number] => {
    if (!straight(Math.max(i, j)))
      return axis === 0 ? [0, Math.sign(Y(j) - Y(i)) || 1] : [Math.sign(X(j) - X(i)) || 1, 0];
    const dx = X(j) - X(i);
    const dy = Y(j) - Y(i);
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  };
  const [sdx, sdy] = unit(0, 1, axes[1] ?? 0);
  const [edx, edy] = unit(last - 1, last, axes[last] ?? 0);
  const sx = X(0);
  const sy = Y(0);
  const ex = X(last);
  const ey = Y(last);
  xs[0] = sx + sdx * startTrim;
  ys[0] = sy + sdy * startTrim;
  xs[last] = ex - edx * endTrim;
  ys[last] = ey - edy * endTrim;
  const length = (i: number): number => Math.abs(X(i) - X(i - 1)) + Math.abs(Y(i) - Y(i - 1));
  const turns = (i: number): boolean =>
    !linear &&
    i > 0 &&
    i < last &&
    aligned(i) &&
    aligned(i + 1) &&
    length(i) >= 0.01 &&
    length(i + 1) >= 0.01 &&
    Math.abs(X(i) - X(i - 1)) < 0.01 !== Math.abs(X(i + 1) - X(i)) < 0.01;
  const along = (i: number, ux: number, uy: number): number =>
    Math.abs(X(i) - X(i - 1)) * Math.abs(ux) + Math.abs(Y(i) - Y(i - 1)) * Math.abs(uy);
  // A curve into a marker runs straight for a little way first, where there is room.
  const lead = (run: number): number => Math.min(LEAD, run / 4);
  const arrives =
    endTrim > 0 && (!straight(last) || turns(last - 1)) ? lead(along(last, edx, edy)) : 0;
  const leaves = startTrim > 0 && (!straight(1) || turns(1)) ? lead(along(1, sdx, sdy)) : 0;
  if (arrives >= 1) {
    xs.splice(last, 0, X(last) - edx * arrives);
    ys.splice(last, 0, Y(last) - edy * arrives);
    axes.splice(last, 0, axes[last]!);
    last++;
  }
  if (leaves >= 1) {
    xs.splice(1, 0, X(0) + sdx * leaves);
    ys.splice(1, 0, Y(0) + sdy * leaves);
    axes.splice(1, 0, axes[1]!);
    last++;
  }

  const b = w.path().moveTo(X(0), Y(0));
  let atX = X(0);
  let atY = Y(0);
  const lineTo = (x: number, y: number): void => {
    if (near(x, y, atX, atY)) return;
    b.lineTo(x, y);
    atX = x;
    atY = y;
  };
  for (let i = 1; i <= last; i++) {
    const x = X(i);
    const y = Y(i);
    if (!straight(i)) {
      const down = axes[i] === 0;
      const run = down ? y - atY : x - atX;
      const k = Math.abs(run) * ease(down ? x - atX : y - atY, run);
      const ux = down ? 0 : Math.sign(run) * k;
      const uy = down ? Math.sign(run) * k : 0;
      b.curveTo(atX + ux, atY + uy, x - ux, y - uy, x, y);
      atX = x;
      atY = y;
      continue;
    }
    if (!turns(i)) {
      // A point part of the way along one straight run adds nothing.
      if (
        i < last &&
        aligned(i) &&
        aligned(i + 1) &&
        (x - X(i - 1)) * (X(i + 1) - x) + (y - Y(i - 1)) * (Y(i + 1) - y) > 0
      )
        continue;
      lineTo(x, y);
      continue;
    }
    let before = turns(i - 1) ? length(i) / 2 : length(i);
    let after = turns(i + 1) ? length(i + 1) / 2 : length(i + 1);
    if (cornered) before = after = Math.min(kind === 'rounded' ? RADIUS : CORNER, before, after);
    const [ux, uy] = unit(i - 1, i, axes[i]!);
    const [vx, vy] = unit(i, i + 1, axes[i + 1]!);
    lineTo(x - ux * before, y - uy * before);
    atX = x + vx * after;
    atY = y + vy * after;
    // A right-angle turn, so the arc's radius is its leg; the sweep follows the turn (y down).
    if (kind === 'rounded') b.arcTo(before, before, 0, false, ux * vy - uy * vx > 0, atX, atY);
    else if (cornered) b.quadTo(x, y, atX, atY);
    else
      b.curveTo(
        x - ux * before * (1 - HANDLE),
        y - uy * before * (1 - HANDLE),
        x + vx * after * (1 - HANDLE),
        y + vy * after * (1 - HANDLE),
        atX,
        atY
      );
  }
  return { d: b.done(), sx, sy, sdx: -sdx, sdy: -sdy, ex, ey, edx, edy };
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

const HEADS: ReadonlyMap<string, HeadKind> = /* @__PURE__ */ new Map<string, HeadKind>([
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
    'arrow_circle',
    {
      trim: (g) => g.circleGap + g.circleSize / 2,
      draw(w, { x, y, dx, dy }, paint, g) {
        const r = g.circleSize / 2;
        const back = g.circleGap + r;
        w.leaf('circle', {
          class: 'marker',
          cx: x - dx * back,
          cy: y - dy * back,
          r,
          ...paint,
          stroke: 'none',
        });
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
export const markerTrim = (type: string, geometry: Arrowheads): number =>
  HEADS.get(type)?.trim(geometry) ?? 0;

/**
 * Draws a v12 end marker for a line that meets the node outline at `end` (x, y), pointing
 * along (dx, dy). The marker sits its gap before the outline; `paint` gives its colour as `fill`.
 */
export function marker(
  w: SvgWriter,
  type: string,
  end: LineEnd,
  paint: Attrs,
  geometry: Arrowheads
): void {
  HEADS.get(type)?.draw(w, end, paint, geometry);
}
