/**
 * Lane and commit positions, ported from v12's `setBranchPosition`, `drawCommits`,
 * `calculatePosition`, `findClosestParent` and `setParallelBTPos`.
 *
 * Parent graphs can have cycles (D264): a duplicate id makes a commit its own parent, or the
 * parent of a commit made before it. Every loop here runs over the commits in `seq` order, never
 * along parents, so it ends; and only parents made before a commit (a smaller `seq`, never the
 * commit itself) count as placed. A commit with none is placed as a root.
 */
import type { GitCommit, GitModel } from '../model.ts';
import type { Env } from './env.ts';
import { labelSpan } from './labels.ts';
import type { GitText, Point } from './types.ts';

export interface Placed {
  /** Lane positions across the commit axis, by branch index. */
  readonly lanes: readonly number[];
  /** Each branch name measured, by branch index. */
  readonly names: readonly GitText[];
  /** By commit index (model order). */
  readonly points: readonly Point[];
  /** v12 `pos` at each commit: its place along the axis before the offset. */
  readonly raw: readonly number[];
  /** The lane index of each commit. */
  readonly laneOf: readonly number[];
  /** v12 `maxPos`: where the branch lines end. */
  readonly maxPos: number;
}

/** Branch names break only on a newline (D263); each line is trimmed, as v12 did. */
export const nameLines = (name: string): string[] => name.split('\n').map((l) => l.trim());

export function place(env: Env, model: GitModel): Placed {
  const { axis } = env.m;
  const vertical = model.direction !== 'LR';
  const names = model.branches.map((b) => env.text(nameLines(b.name), env.fonts.branch));
  const lanes: number[] = [];
  let at = 0;
  let labelEnd = -Infinity;
  names.forEach((t) => {
    if (env.showBranches) {
      const span = labelSpan(env, model.direction, t);
      // Only where v12's boxes would overlap: then clear the previous one by `labelGap`.
      if (at + span.start < labelEnd) at = labelEnd + env.m.branchLabel.labelGap - span.start;
      labelEnd = at + span.start + span.size;
    }
    lanes.push(at);
    at +=
      axis.lanePitch +
      (env.rotateCommitLabel ? axis.rotatedLanePitch : 0) +
      (vertical ? t.width / 2 : 0);
  });

  const laneIndex = new Map(model.branches.map((b, i) => [b.name, i]));
  const commits = model.commits;
  const laneOf = commits.map((c) => laneIndex.get(c.branch) ?? 0);
  const index = new Map(commits.map((c, i) => [c.id, i]));
  // Parents placed before the commit: made earlier, and not the commit itself.
  const earlier = (c: GitCommit, i: number): number[] => {
    const out: number[] = [];
    for (const p of c.parents) {
      const j = index.get(p);
      if (j !== undefined && j !== i && commits[j]!.seq < c.seq) out.push(j);
    }
    return out;
  };
  // Ties go to the later parent, as v12's `>=` / `<=` comparisons do.
  const closest = (js: readonly number[], pos: (j: number) => number, low: boolean): number => {
    let best = js[0]!;
    for (const j of js) if (low ? pos(j) <= pos(best) : pos(j) >= pos(best)) best = j;
    return best;
  };

  const order = commits.map((c, i) => i).sort((a, b) => commits[a]!.seq - commits[b]!.seq);
  const along = new Array<number>(commits.length).fill(0);
  const raw = new Array<number>(commits.length).fill(0);
  let maxPos = 0;

  if (model.direction === 'BT' && env.parallelCommits) {
    // setParallelBTPos: a first pass for the roots' depth, then each commit one step above its
    // closest (highest) parent; drawCommits then lifts every commit one more step.
    const first = new Array<number>(commits.length).fill(0);
    const roots = new Set<number>();
    let cur = axis.start;
    let deepest = axis.start;
    for (const i of order) {
      const ps = earlier(commits[i]!, i);
      if (ps.length > 0) {
        cur = first[closest(ps, (j) => first[j]!, true)]! + axis.step;
        deepest = Math.max(deepest, cur);
      } else roots.add(i);
      first[i] = cur + axis.offset;
    }
    const second = new Array<number>(commits.length).fill(0);
    for (const i of roots) second[i] = deepest + axis.start;
    for (const i of order) {
      if (roots.has(i)) continue;
      const ps = earlier(commits[i]!, i);
      second[i] = second[closest(ps, (j) => second[j]!, true)]! - axis.step - axis.offset;
    }
    for (const i of [...order].reverse()) {
      const pos = second[i]! - axis.step;
      raw[i] = pos;
      along[i] = pos;
      maxPos = Math.max(maxPos, pos + axis.step);
    }
  } else {
    let pos = vertical ? axis.start : 0;
    const seq = model.direction === 'BT' ? [...order].reverse() : order;
    for (const i of seq) {
      if (env.parallelCommits) {
        const ps = earlier(commits[i]!, i);
        if (ps.length > 0) pos = along[closest(ps, (j) => along[j]!, false)]! + axis.step;
        else pos = vertical ? axis.start : 0;
      }
      raw[i] = pos;
      along[i] = pos + axis.offset;
      pos += axis.step + axis.offset;
      maxPos = Math.max(maxPos, pos);
    }
  }

  const points = commits.map((_, i) => {
    const lane = lanes[laneOf[i]!] ?? 0;
    return vertical ? { x: lane, y: along[i]! } : { x: along[i]!, y: lane + env.g.laneOffset };
  });
  return { lanes, names, points, raw, laneOf, maxPos };
}
