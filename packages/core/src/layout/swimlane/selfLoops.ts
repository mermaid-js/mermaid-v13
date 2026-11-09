// Self-loops, which v12's router skips (`orthogonalRouter/router.ts`: "Skip self-loops") and v12's
// renderer drew without points. v13's model needs a route for every edge, so each self-loop gets
// a right-angled loop off one side of its node, in final coordinates, after post-processing. A
// labelled loop leaves the side that faces its label node (which the phases place beside the
// node) and its far leg runs through the label's centre, so the label sits on the line as other
// edge labels do.
import type { LayoutData, Node } from './layoutData.ts';

type Side = 'top' | 'right' | 'bottom' | 'left';

/** How far an unlabelled loop stands off its node. */
const LOOP = 10;
/** Room kept between a loop's legs and the label they pass. */
const LABEL_GAP = 3;
/** How far a leg keeps from the node's corners. */
const CORNER = 4;

const centre = (n: Node): { x: number; y: number } => ({ x: n.x ?? 0, y: n.y ?? 0 });

/** The side of `node` that faces `label`: the axis on which the gap between them is larger. */
function facing(node: Node, label: Node): Side {
  const n = centre(node);
  const l = centre(label);
  const gapX = Math.abs(l.x - n.x) - ((node.width ?? 0) + (label.width ?? 0)) / 2;
  const gapY = Math.abs(l.y - n.y) - ((node.height ?? 0) + (label.height ?? 0)) / 2;
  if (gapX >= gapY) return l.x >= n.x ? 'right' : 'left';
  return l.y >= n.y ? 'bottom' : 'top';
}

/**
 * The legs' offsets along the side, either side of the node's centre: clear of the label when
 * the side is long enough, else as far apart as the corners allow.
 */
function legOffset(sideLength: number, labelAcross: number | undefined): number {
  const most = Math.max(0, sideLength / 2 - CORNER);
  const wanted = labelAcross === undefined ? sideLength / 4 : labelAcross / 2 + LABEL_GAP;
  return Math.min(wanted, most);
}

/** The loop's four points: out from `side` at both legs, along the far leg at `far`. */
function loopPoints(
  node: Node,
  side: Side,
  far: number,
  offset: number
): { x: number; y: number }[] {
  const { x, y } = centre(node);
  const w = (node.width ?? 0) / 2;
  const h = (node.height ?? 0) / 2;
  switch (side) {
    case 'right':
    case 'left': {
      const edge = side === 'right' ? x + w : x - w;
      return [
        { x: edge, y: y - offset },
        { x: far, y: y - offset },
        { x: far, y: y + offset },
        { x: edge, y: y + offset },
      ];
    }
    case 'top':
    case 'bottom': {
      const edge = side === 'bottom' ? y + h : y - h;
      return [
        { x: x - offset, y: edge },
        { x: x - offset, y: far },
        { x: x + offset, y: far },
        { x: x + offset, y: edge },
      ];
    }
  }
}

/** Gives every self-loop of `data` its route, through its label when it has one. */
export function routeSelfLoops(data: LayoutData): void {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  for (const edge of data.edges) {
    if (edge.isLayoutOnly || edge.start !== edge.end) continue;
    const node = byId.get(edge.start);
    if (!node) continue;
    const label = edge.labelNodeId ? byId.get(edge.labelNodeId) : undefined;
    if (!label) {
      const right = (node.x ?? 0) + (node.width ?? 0) / 2;
      edge.points = loopPoints(node, 'right', right + LOOP, legOffset(node.height ?? 0, undefined));
      continue;
    }
    const side = facing(node, label);
    const across = side === 'left' || side === 'right';
    // The label rides the far leg: centred on it, level with the node's centre.
    const n = centre(node);
    if (across) label.y = n.y;
    else label.x = n.x;
    const far = across ? (label.x ?? 0) : (label.y ?? 0);
    const sideLength = (across ? node.height : node.width) ?? 0;
    const labelAcross = across ? label.height : label.width;
    edge.points = loopPoints(node, side, far, legOffset(sideLength, labelAcross));
  }
}
