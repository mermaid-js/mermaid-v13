/**
 * Arrows, ported from v12's `drawArrows`, `drawArrow`, `shouldRerouteArrow` and `findLane`: one
 * per parent, from the parent's centre to the commit's, with quarter-circle corners; an arrow
 * whose corner would cross a commit in the way goes round it on a free lane. No arrow for a
 * self-parent (D264). Loops run over the commits, never along parents, so cycles end.
 */
import type { GitCommit, GitModel } from '../model.ts';
import type { Env } from './env.ts';
import type { Placed } from './place.ts';
import type { GitArrow, PathCommand, Point } from './types.ts';

const M = (x: number, y: number): PathCommand => ({ op: 'M', x, y });
const L = (x: number, y: number): PathCommand => ({ op: 'L', x, y });
// v12's `arc` (sweep 0) and `arc2` (sweep 1).
const A = (r: number, sweep: 0 | 1, x: number, y: number): PathCommand => ({
  op: 'A',
  r,
  sweep,
  x,
  y,
});

export function arrowsOf(env: Env, model: GitModel, p: Placed): GitArrow[] {
  const { arrow: am } = env.m;
  const dir = model.direction;
  const commits = model.commits;
  const index = new Map(commits.map((c, i) => [c.id, i]));
  // The lanes taken: the branch lines (only when drawn, as v12 pushed them while drawing), then
  // each free lane a rerouted arrow takes.
  const taken: number[] = [];
  if (env.showBranches)
    for (const pos of p.lanes) taken.push(dir === 'LR' ? pos + env.g.laneOffset : pos);

  const findLane = (lo: number, hi: number): number => {
    for (let depth = 0, far = hi; ; depth++) {
      const candidate = lo + Math.abs(lo - far) / 2;
      if (depth > am.laneTries) return candidate;
      if (taken.every((lane) => Math.abs(lane - candidate) >= am.laneGap)) {
        taken.push(candidate);
        return candidate;
      }
      far -= Math.abs(lo - far) / am.laneShrink;
    }
  };

  const reroute = (a: GitCommit, b: GitCommit, p1: Point, p2: Point): boolean => {
    const bFurthest = dir === 'LR' ? p1.y < p2.y : p1.x < p2.x;
    const branch = bFurthest ? b.branch : a.branch;
    return commits.some((x) => x.seq > a.seq && x.seq < b.seq && x.branch === branch);
  };

  const out: GitArrow[] = [];
  commits.forEach((b, bi) => {
    for (const [k, parent] of b.parents.entries()) {
      const ai = index.get(parent);
      // A self-parent (D264) draws nothing; a repeated parent (a cherry-pick onto the branch
      // whose head is its source, `[A, A]`) one arrow, as v12's two coincide.
      if (ai === undefined || ai === bi || b.parents.indexOf(parent) !== k) continue;
      const a = commits[ai]!;
      const p1 = p.points[ai]!;
      const p2 = p.points[bi]!;
      const second = b.type === 'MERGE' && a.id !== b.parents[0];
      let lane = second ? p.laneOf[ai]! : p.laneOf[bi]!;
      const rerouted = reroute(a, b, p1, p2);
      let path: PathCommand[];
      if (rerouted) {
        const r = am.reroutedRadius;
        const lineY = p1.y < p2.y ? findLane(p1.y, p2.y) : findLane(p2.y, p1.y);
        const lineX = p1.x < p2.x ? findLane(p1.x, p2.x) : findLane(p2.x, p1.x);
        if (dir !== 'LR') {
          const s = dir === 'TB' ? 1 : -1;
          // TB bends down then along; BT the same mirrored, so the arc sweeps swap.
          const [s1, s2]: [0 | 1, 0 | 1] = dir === 'TB' ? [1, 0] : [0, 1];
          if (p1.x < p2.x)
            path = [
              M(p1.x, p1.y),
              L(lineX - r, p1.y),
              A(r, s1, lineX, p1.y + s * r),
              L(lineX, p2.y - s * r),
              A(r, s2, lineX + r, p2.y),
              L(p2.x, p2.y),
            ];
          else {
            lane = p.laneOf[ai]!;
            path = [
              M(p1.x, p1.y),
              L(lineX + r, p1.y),
              A(r, s2, lineX, p1.y + s * r),
              L(lineX, p2.y - s * r),
              A(r, s1, lineX - r, p2.y),
              L(p2.x, p2.y),
            ];
          }
        } else if (p1.y < p2.y)
          path = [
            M(p1.x, p1.y),
            L(p1.x, lineY - r),
            A(r, 0, p1.x + r, lineY),
            L(p2.x - r, lineY),
            A(r, 1, p2.x, lineY + r),
            L(p2.x, p2.y),
          ];
        else {
          lane = p.laneOf[ai]!;
          path = [
            M(p1.x, p1.y),
            L(p1.x, lineY + r),
            A(r, 1, p1.x + r, lineY),
            L(p2.x - r, lineY),
            A(r, 0, p2.x, lineY - r),
            L(p2.x, p2.y),
          ];
        }
      } else path = plain(dir, p1, p2, second, am.radius);
      out.push({ from: a.id, to: b.id, lane, rerouted, path });
    }
  });
  return out;
}

/** An arrow with no commit in the way: one 20 px corner, or straight along a lane. */
function plain(
  dir: GitModel['direction'],
  p1: Point,
  p2: Point,
  second: boolean,
  r: number
): PathCommand[] {
  const start = M(p1.x, p1.y);
  const end = L(p2.x, p2.y);
  if (dir === 'LR') {
    if (p1.y === p2.y) return [start, end];
    const s = p1.y < p2.y ? 1 : -1;
    // Into a merge from its second parent: along the source lane first, then across.
    if (second) return [start, L(p2.x - r, p1.y), A(r, s > 0 ? 1 : 0, p2.x, p1.y + s * r), end];
    return [start, L(p1.x, p2.y - s * r), A(r, s > 0 ? 0 : 1, p1.x + r, p2.y), end];
  }
  if (p1.x === p2.x) return [start, end];
  const s = dir === 'TB' ? 1 : -1;
  const right = p1.x < p2.x;
  const h = right ? 1 : -1;
  // TB rightward: across with sweep 1 (`arc2`), into a merge with sweep 0 (`arc`); leftward
  // the other way round; BT mirrors TB.
  const across: 0 | 1 = right === (dir === 'TB') ? 1 : 0;
  const into: 0 | 1 = across === 1 ? 0 : 1;
  if (second) return [start, L(p1.x, p2.y - s * r), A(r, into, p1.x + h * r, p2.y), end];
  return [start, L(p2.x - h * r, p1.y), A(r, across, p2.x, p1.y + s * r), end];
}
