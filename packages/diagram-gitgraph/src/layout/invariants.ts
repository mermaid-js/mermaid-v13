/**
 * Layout invariants for `GitLayout` (spec #292 T3), in every direction, with `parallelCommits`
 * on and off: properties of the output that the layout code does not hold by construction. Run
 * them on any model: `gitLayoutViolations(model, layoutGitGraph(model, ctx), { parallelCommits })`.
 *
 * - no NaN or infinite number;
 * - one lane per model branch and one commit layout per model commit, in order, with its id;
 * - commits on their lane: across the axis, every commit of a lane sits at one offset from the
 *   lane (none in TB and BT), on the branch line when one is drawn;
 * - without `parallelCommits`, commits in `seq` order along the axis, one step apart; with it,
 *   each commit one step after its closest parent made before it (LR right of the rightmost,
 *   TB below the lowest, BT above the highest), the others where the roots start;
 * - one arrow per parent but a self-parent (D264), from the parent's centre to the commit's;
 * - no two branch labels overlap;
 * - the bounds hold every bullet, line and arrow vertex, and every corner of every label, tag
 *   and the title as its transform draws it.
 *
 * Each violation is one readable line. Comparisons allow a float tolerance.
 */
import type { GitModel } from '../model.ts';
import { apply, corners } from './env.ts';
import { GIT_METRICS } from './metrics.ts';
import type { GitLayout, Point, Rect, Transform } from './types.ts';
import {
  nonFinite as numbers,
  rectsOverlap as overlaps,
} from '@mermaid-js/shared/layout/invariants';

export interface ViolationOptions {
  /** Whether the layout ran with `parallelCommits`. */
  readonly parallelCommits?: boolean;
}

const EPS = 1e-6;

const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPS;
const fmt = (p: Point): string => `(${p.x}, ${p.y})`;

function counts(model: GitModel, layout: GitLayout, out: string[]): void {
  if (layout.direction !== model.direction)
    out.push(`direction is ${layout.direction}, the model's is ${model.direction}`);
  const lanes = layout.lanes.map((l) => l.branch).join(',');
  const branches = model.branches.map((b) => b.name).join(',');
  if (lanes !== branches) out.push(`lanes [${lanes}], the model's branches [${branches}]`);
  layout.lanes.forEach((l, i) => {
    if (l.index !== i) out.push(`lane ${l.branch} has index ${l.index}, not ${i}`);
  });
  const ids = layout.commits.map((c) => c.id).join(',');
  const want = model.commits.map((c) => c.id).join(',');
  if (ids !== want) out.push(`commits [${ids}], the model's [${want}]`);
}

function onLanes(model: GitModel, layout: GitLayout, out: string[]): void {
  const lr = layout.direction === 'LR';
  const offsets = new Set<number>();
  layout.commits.forEach((c, i) => {
    const lane = layout.lanes[c.lane];
    const branch = model.commits[i]?.branch;
    if (!lane || lane.branch !== branch) {
      out.push(`commit ${c.id} is on lane ${lane?.branch}, its branch is ${branch}`);
      return;
    }
    const across = lr ? c.y : c.x;
    offsets.add(Math.round((across - lane.pos) / EPS) * EPS);
    if (lane.line && !near(across, lr ? lane.line.y1 : lane.line.x1))
      out.push(`commit ${c.id} at ${fmt(c)} is off the ${lane.branch} line`);
  });
  if (offsets.size > 1) out.push(`commits sit at ${offsets.size} offsets from their lanes`);
  if (!lr && offsets.size === 1 && !offsets.has(0))
    out.push(`commits sit off their lanes across the axis`);
}

function ordered(model: GitModel, layout: GitLayout, parallel: boolean, out: string[]): void {
  const dir = layout.direction;
  const step = GIT_METRICS.axis.step + GIT_METRICS.axis.offset;
  const along = (i: number): number => {
    const c = layout.commits[i]!;
    return dir === 'LR' ? c.x : c.y;
  };
  const sign = dir === 'BT' ? -1 : 1;
  const commits = model.commits;
  if (!parallel) {
    for (let i = 1; i < commits.length; i++)
      if (!near(sign * (along(i) - along(i - 1)), step))
        out.push(`commit ${commits[i]!.id} is not one step after ${commits[i - 1]!.id}`);
    return;
  }
  const index = new Map(commits.map((c, i) => [c.id, i]));
  const all = commits.map((_, i) => along(i));
  const start = sign > 0 ? Math.min(...all) : Math.max(...all);
  commits.forEach((c, i) => {
    const before = c.parents
      .map((p) => index.get(p))
      .filter((j): j is number => j !== undefined && j !== i && commits[j]!.seq < c.seq);
    if (before.length === 0) {
      if (!near(along(i), start)) out.push(`root ${c.id} is not where the roots start`);
      return;
    }
    const closest = sign > 0 ? Math.max(...before.map(along)) : Math.min(...before.map(along));
    if (!near(along(i), closest + sign * step))
      out.push(`commit ${c.id} is not one step after its closest parent`);
  });
}

function arrows(model: GitModel, layout: GitLayout, out: string[]): void {
  const byId = new Map(layout.commits.map((c) => [c.id, c]));
  const want: string[] = [];
  for (const c of model.commits)
    for (const p of c.parents) if (p !== c.id && byId.has(p)) want.push(`${p}>${c.id}`);
  const got = layout.arrows.map((a) => `${a.from}>${a.to}`);
  if (got.join(',') !== want.join(','))
    out.push(`arrows [${got.join(', ')}], the parents give [${want.join(', ')}]`);
  for (const a of layout.arrows) {
    const from = byId.get(a.from);
    const to = byId.get(a.to);
    const first = a.path[0];
    const last = a.path.at(-1);
    if (!from || !to || !first || !last) continue;
    if (first.op !== 'M' || !near(first.x, from.x) || !near(first.y, from.y))
      out.push(`arrow ${a.from} → ${a.to} starts at ${fmt(first)}, not ${fmt(from)}`);
    if (!near(last.x, to.x) || !near(last.y, to.y))
      out.push(`arrow ${a.from} → ${a.to} ends at ${fmt(last)}, not ${fmt(to)}`);
  }
}

function labelsApart(layout: GitLayout, out: string[]): void {
  const labelled = layout.lanes.filter((l) => l.label);
  for (let i = 0; i < labelled.length; i++)
    for (let j = i + 1; j < labelled.length; j++)
      if (overlaps(labelled[i]!.label!.box, labelled[j]!.label!.box))
        out.push(`the ${labelled[i]!.branch} label overlaps the ${labelled[j]!.branch} label`);
}

function contained(layout: GitLayout, out: string[]): void {
  const b = layout.bounds;
  const holds = (what: string, p: Point, reach = 0): void => {
    if (
      p.x - reach < b.x - EPS ||
      p.y - reach < b.y - EPS ||
      p.x + reach > b.x + b.width + EPS ||
      p.y + reach > b.y + b.height + EPS
    )
      out.push(`${what} at ${fmt(p)} is outside the bounds`);
  };
  const rect = (what: string, r: Rect, t?: Transform): void => {
    for (const c of corners(r)) holds(what, apply(t, c));
  };
  for (const l of layout.lanes) {
    if (l.line) {
      holds(`the ${l.branch} line`, { x: l.line.x1, y: l.line.y1 }, layout.lineWidth / 2);
      holds(`the ${l.branch} line`, { x: l.line.x2, y: l.line.y2 }, layout.lineWidth / 2);
    }
    if (l.label) {
      rect(`the ${l.branch} label`, l.label.box);
      rect(`the ${l.branch} label text`, l.label.text);
    }
  }
  for (const c of layout.commits) {
    holds(`commit ${c.id}`, c, c.radius);
    if (c.label) {
      rect(`the ${c.id} label`, c.label.box, c.label.transform);
      rect(`the ${c.id} label text`, c.label.text, c.label.transform);
    }
    for (const t of c.tags) {
      for (const p of t.points) holds(`tag ${t.tag} of ${c.id}`, apply(t.transform, p));
      holds(`the hole of tag ${t.tag}`, apply(t.transform, t.hole), t.hole.r);
      rect(`tag ${t.tag} text`, t.text, t.textTransform);
    }
  }
  for (const a of layout.arrows)
    for (const p of a.path) holds(`arrow ${a.from} → ${a.to}`, p, layout.arrowWidth / 2);
  if (layout.title) rect('the title', layout.title);
}

/** Every invariant `layout` breaks for `model`; empty when it holds them all. */
export function gitLayoutViolations(
  model: GitModel,
  layout: GitLayout,
  options: ViolationOptions = {}
): string[] {
  const out: string[] = [];
  numbers(layout, 'layout', out);
  counts(model, layout, out);
  if (out.length > 0) return out;
  onLanes(model, layout, out);
  ordered(model, layout, options.parallelCommits === true, out);
  arrows(model, layout, out);
  labelsApart(layout, out);
  contained(layout, out);
  return out;
}
