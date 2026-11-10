// The router sees LR and RL nodes as they will be drawn (v13). v12 routes every direction in TB
// coordinates, and `lrTransform` then turns the result: TB x becomes LR y as is, TB y becomes LR x
// stretched by `flowAxisStretch`. v12 handed the router the nodes' unturned sizes (and turned
// only LR's obstacle extents, `isLR`), so ports on a node's side landed off the turned box, RL
// detours used the TB width, and same-rank back edges ran through their nodes (#636). Here the
// router runs, as for TB, on the drawing transposed: y stretched as `lrTransform` will stretch
// it, and each box its drawn height across and drawn width along, so ports, anchors and margins
// come out at their drawn lengths. The routes are un-stretched afterwards for the turn.
import type { LayoutData } from './layoutData.ts';
import { flowAxisStretch } from './direction/lrTransform.ts';
import { routeEdgesOrthogonal } from './orthogonalRouter/router.ts';

/** Routes `data` (TB coordinates) for `direction`, with turned sizes for LR and RL. */
export function routeForDirection(data: LayoutData, direction: string): void {
  if (direction !== 'LR' && direction !== 'RL') {
    routeEdgesOrthogonal(data, direction);
    return;
  }
  const stretch = flowAxisStretch(data.nodes.filter((n) => !n.isGroup));
  const saved = data.nodes.map((n) => [n, n.y, n.width, n.height] as const);
  for (const n of data.nodes) {
    if (n.y !== undefined) n.y *= stretch;
    if (n.width === undefined || n.height === undefined) continue;
    [n.width, n.height] = [n.height, n.width];
  }
  try {
    routeEdgesOrthogonal(data, 'TB');
  } finally {
    for (const [n, y, w, h] of saved) {
      n.y = y;
      n.width = w;
      n.height = h;
    }
    for (const e of data.edges) for (const p of e.points ?? []) p.y /= stretch;
  }
}
