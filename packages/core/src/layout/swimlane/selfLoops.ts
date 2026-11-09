// Self-loops, which v12's router skips (`orthogonalRouter/router.ts`: "Skip self-loops") and v12's
// renderer drew without points. v13's model needs a route for every edge, so each self-loop gets
// a right-angled loop off one side of its node, in final coordinates, after post-processing.
// - A labelled loop leaves the side that faces its label node (which the phases place beside the
//   node) and its far leg runs through the label's centre, so the label sits on the line as other
//   edge labels do. The label moves level with the node's centre when nothing is in the way there;
//   otherwise it stays and the loop reaches it.
// - An unlabelled loop takes the first free face across the flow (right or left for TB/BT, bottom
//   or top for LR/RL), then the face the flow enters by, then the one it leaves by: free means no
//   other edge ends on it and the loop meets no other node, label or route.
import type { LayoutData, Node } from './layoutData.ts';

type Side = 'top' | 'right' | 'bottom' | 'left';

interface Pt {
  x: number;
  y: number;
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** How far an unlabelled loop stands off its node. */
const LOOP = 10;
/** Room kept between a loop's legs and the label they pass. */
const LABEL_GAP = 3;
/** How far a leg keeps from the node's corners. */
const CORNER = 4;
/** Distance under which two things count as touching. */
const TOUCH = 1;

const centre = (n: Node): Pt => ({ x: n.x ?? 0, y: n.y ?? 0 });

const rectOf = (n: Node): Rect => {
  const { x, y } = centre(n);
  const [w, h] = [(n.width ?? 0) / 2, (n.height ?? 0) / 2];
  return { left: x - w, right: x + w, top: y - h, bottom: y + h };
};

const overlaps = (a: Rect, b: Rect): boolean =>
  a.left < b.right - TOUCH &&
  b.left < a.right - TOUCH &&
  a.top < b.bottom - TOUCH &&
  b.top < a.bottom - TOUCH;

/** Whether the segment a–b comes within `TOUCH` of `r`. */
function segmentMeets(a: Pt, b: Pt, r: Rect): boolean {
  const s = {
    left: Math.min(a.x, b.x) - TOUCH,
    right: Math.max(a.x, b.x) + TOUCH,
    top: Math.min(a.y, b.y) - TOUCH,
    bottom: Math.max(a.y, b.y) + TOUCH,
  };
  return s.left < r.right && r.left < s.right && s.top < r.bottom && r.top < s.bottom;
}

/** The side of `node` that faces `label`: the axis on which the gap between them is larger. */
function facing(node: Node, label: Node): Side {
  const n = centre(node);
  const l = centre(label);
  const gapX = Math.abs(l.x - n.x) - ((node.width ?? 0) + (label.width ?? 0)) / 2;
  const gapY = Math.abs(l.y - n.y) - ((node.height ?? 0) + (label.height ?? 0)) / 2;
  if (gapX >= gapY) return l.x >= n.x ? 'right' : 'left';
  return l.y >= n.y ? 'bottom' : 'top';
}

const across = (side: Side): boolean => side === 'left' || side === 'right';

/**
 * Points in the frame of `side`: `u` along the side, `v` out from the node, in drawing
 * coordinates.
 */
const toPoint = (side: Side, u: number, v: number): Pt =>
  across(side) ? { x: v, y: u } : { x: u, y: v };

/** The node's side line (`v`) and its span along the side (`u`). */
function sideFrame(node: Node, side: Side): { edge: number; lo: number; hi: number; mid: number } {
  const r = rectOf(node);
  const edge = { left: r.left, right: r.right, top: r.top, bottom: r.bottom }[side];
  const [lo, hi] = across(side) ? [r.top, r.bottom] : [r.left, r.right];
  return { edge, lo, hi, mid: (lo + hi) / 2 };
}

/**
 * A loop off `side` with its far leg at `far`, legs `offset` either side of the side's middle;
 * when `through` (a `u` the far leg must reach) lies beyond the legs, the loop runs out to it
 * along the far leg and back in beside the label, short of `near` (the label's near edge).
 */
function loopPoints(
  node: Node,
  side: Side,
  far: number,
  offset: number,
  through?: { u: number; near: number }
): Pt[] {
  const f = sideFrame(node, side);
  const [a, b] = [f.mid - offset, f.mid + offset];
  const at = (u: number, v: number): Pt => toPoint(side, u, v);
  if (!through || (through.u >= a && through.u <= b)) {
    return [at(a, f.edge), at(a, far), at(b, far), at(b, f.edge)];
  }
  const back = (f.edge + through.near) / 2;
  const [stay, turn] = through.u < a ? [b, a] : [a, b];
  return [
    at(stay, f.edge),
    at(stay, far),
    at(through.u, far),
    at(through.u, back),
    at(turn, back),
    at(turn, f.edge),
  ];
}

/**
 * The legs' offsets along the side, either side of its middle: clear of the label when the side
 * is long enough, else as far apart as the corners allow.
 */
function legOffset(sideLength: number, labelAcross: number | undefined): number {
  const most = Math.max(0, sideLength / 2 - CORNER);
  const wanted = labelAcross === undefined ? sideLength / 4 : labelAcross / 2 + LABEL_GAP;
  return Math.min(wanted, most);
}

/** The faces an unlabelled loop tries, in order: across the flow, then in, then out. */
function preferredSides(direction: string): Side[] {
  switch (direction) {
    case 'LR':
      return ['bottom', 'top', 'left', 'right'];
    case 'RL':
      return ['bottom', 'top', 'right', 'left'];
    case 'BT':
      return ['right', 'left', 'bottom', 'top'];
    default:
      return ['right', 'left', 'top', 'bottom'];
  }
}

/** The side of `node` that `p` lies on, if it lies on the node's border. */
function sideAt(node: Node, p: Pt): Side | undefined {
  const r = rectOf(node);
  if (Math.abs(p.x - r.left) <= TOUCH) return 'left';
  if (Math.abs(p.x - r.right) <= TOUCH) return 'right';
  if (Math.abs(p.y - r.top) <= TOUCH) return 'top';
  if (Math.abs(p.y - r.bottom) <= TOUCH) return 'bottom';
  return undefined;
}

/** Whether a loop's points stay clear of every other node, label and route. */
function clear(data: LayoutData, node: Node, points: Pt[]): boolean {
  for (const n of data.nodes) {
    if (n === node || n.isGroup || n.x === undefined) continue;
    const r = rectOf(n);
    for (let i = 1; i < points.length; i++)
      if (segmentMeets(points[i - 1]!, points[i]!, r)) return false;
  }
  for (const e of data.edges) {
    const pts = e.points ?? [];
    if (e.isLayoutOnly || e.start === e.end) continue;
    for (let j = 1; j < pts.length; j++) {
      const [c, d] = [pts[j - 1]!, pts[j]!];
      const seg = {
        left: Math.min(c.x, d.x),
        right: Math.max(c.x, d.x),
        top: Math.min(c.y, d.y),
        bottom: Math.max(c.y, d.y),
      };
      for (let i = 1; i < points.length; i++)
        if (segmentMeets(points[i - 1]!, points[i]!, seg)) return false;
    }
  }
  return true;
}

function unlabelledLoop(data: LayoutData, node: Node): Pt[] {
  const used = new Set<Side>();
  for (const e of data.edges) {
    if (e.isLayoutOnly || e.start === e.end || !e.points?.length) continue;
    if (e.start === node.id) used.add(sideAt(node, e.points[0]!) ?? 'top');
    if (e.end === node.id) used.add(sideAt(node, e.points.at(-1)!) ?? 'top');
  }
  const loopFor = (side: Side): Pt[] => {
    const f = sideFrame(node, side);
    const out = side === 'right' || side === 'bottom' ? 1 : -1;
    return loopPoints(node, side, f.edge + out * LOOP, legOffset(f.hi - f.lo, undefined));
  };
  const sides = preferredSides(data.direction);
  for (const side of sides) {
    const points = loopFor(side);
    if (!used.has(side) && clear(data, node, points)) return points;
  }
  return loopFor(sides[0]!);
}

function labelledLoop(data: LayoutData, node: Node, label: Node): Pt[] {
  const side = facing(node, label);
  const f = sideFrame(node, side);
  // The label rides the far leg: centred on it, level with the node's centre where nothing is
  // in the way, else where the phases put it.
  const moved = across(side) ? { ...label, y: f.mid } : { ...label, x: f.mid };
  const blocked = data.nodes.some(
    (n) =>
      n !== label &&
      n !== node &&
      !n.isGroup &&
      n.x !== undefined &&
      overlaps(rectOf(moved), rectOf(n))
  );
  if (!blocked) [label.x, label.y] = [moved.x, moved.y];
  const l = centre(label);
  const far = across(side) ? l.x : l.y;
  const u = across(side) ? l.y : l.x;
  const labelOut = (across(side) ? label.width : label.height) ?? 0;
  const near = far - Math.sign(far - f.edge) * (labelOut / 2 + LABEL_GAP);
  const offset = legOffset(f.hi - f.lo, (across(side) ? label.height : label.width) ?? 0);
  return loopPoints(node, side, far, offset, { u, near });
}

/** Gives every self-loop of `data` its route, through its label when it has one. */
export function routeSelfLoops(data: LayoutData): void {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  for (const edge of data.edges) {
    if (edge.isLayoutOnly || edge.start !== edge.end) continue;
    const node = byId.get(edge.start);
    if (!node) continue;
    const label = edge.labelNodeId ? byId.get(edge.labelNodeId) : undefined;
    edge.points = label ? labelledLoop(data, node, label) : unlabelledLoop(data, node);
  }
}
