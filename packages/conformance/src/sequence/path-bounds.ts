// cspell:words MLCAZ
/**
 * The points that bound an SVG path as the sequence renderer writes it (absolute `M`, `L`,
 * `C`, `A` with no rotation, `Z`): every end point, plus the extremes of each cubic and each
 * elliptical arc, so a bulge between two end points counts (#194 review).
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

const numbers = (s: string): number[] =>
  (s.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? []).map(Number);

/** The t in (0, 1) where one axis of a cubic turns. */
function cubicTurns(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const roots: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) roots.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const r = Math.sqrt(disc);
      roots.push((-b + r) / (2 * a), (-b - r) / (2 * a));
    }
  }
  return roots.filter((t) => t > 0 && t < 1);
}

function cubic(from: Point, c1: Point, c2: Point, to: Point): Point[] {
  const at = (t: number): Point => {
    const u = 1 - t;
    const f = (a: number, b: number, c: number, d: number): number =>
      u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
    return { x: f(from.x, c1.x, c2.x, to.x), y: f(from.y, c1.y, c2.y, to.y) };
  };
  const ts = [...cubicTurns(from.x, c1.x, c2.x, to.x), ...cubicTurns(from.y, c1.y, c2.y, to.y)];
  return [...ts.map(at), to];
}

/** SVG 1.1 F.6.5 (endpoint to centre), rotation 0, then the axis extremes inside the sweep. */
function arc(from: Point, args: number[]): Point[] {
  let [rx, ry] = [Math.abs(args[0]!), Math.abs(args[1]!)];
  const large = args[3] !== 0;
  const sweep = args[4] !== 0;
  const to = { x: args[5]!, y: args[6]! };
  if (rx === 0 || ry === 0) return [to];
  const x1 = (from.x - to.x) / 2;
  const y1 = (from.y - to.y) / 2;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (factor * rx * y1) / ry;
  const cy1 = (-factor * ry * x1) / rx;
  const cx = cx1 + (from.x + to.x) / 2;
  const cy = cy1 + (from.y + to.y) / 2;
  const start = Math.atan2((y1 - cy1) / ry, (x1 - cx1) / rx);
  let delta = Math.atan2((-y1 - cy1) / ry, (-x1 - cx1) / rx) - start;
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const out: Point[] = [to];
  for (let k = -4; k <= 4; k++) {
    const angle = (k * Math.PI) / 2;
    const t = (angle - start) / delta;
    if (t > 0 && t < 1) out.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return out;
}

/** Every bounding point of `d`. */
export function pathPoints(d: string): Point[] {
  const out: Point[] = [];
  let at: Point = { x: 0, y: 0 };
  let start = at;
  for (const seg of d.match(/[MLCAZ][^MLCAZ]*/gi) ?? []) {
    const n = numbers(seg.slice(1));
    const cmd = seg[0]!.toUpperCase();
    if (cmd === 'Z') {
      at = start;
      continue;
    }
    if (cmd === 'A') {
      for (let i = 0; i + 6 < n.length; i += 7) {
        out.push(...arc(at, n.slice(i, i + 7)));
        at = { x: n[i + 5]!, y: n[i + 6]! };
      }
    } else if (cmd === 'C') {
      for (let i = 0; i + 5 < n.length; i += 6) {
        const to = { x: n[i + 4]!, y: n[i + 5]! };
        out.push(...cubic(at, { x: n[i]!, y: n[i + 1]! }, { x: n[i + 2]!, y: n[i + 3]! }, to));
        at = to;
      }
    } else {
      for (let i = 0; i + 1 < n.length; i += 2) {
        at = { x: n[i]!, y: n[i + 1]! };
        out.push(at);
        if (cmd === 'M' && i === 0) start = at;
      }
    }
  }
  return out;
}
