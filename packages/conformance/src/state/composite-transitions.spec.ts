/**
 * #416 (spec #975 T1): a transition between a composite and a state inside it is drawn as a
 * visible arrow of its own. When reported, `Comp --> Inner` was 11 px long and `Outer --> Deeper`
 * lay on top of `Deeper --> End`. The two fixtures render through the public API, and every
 * transition has to be at least `MIN_LENGTH` long and share no straight run with another.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from '../index.ts';

const DIR = join(REPO_ROOT, 'e2e/diagrams/state-diagram-v2/baseline/composites');
const FIXTURES = ['to-own-child.mmd', 'to-nested-descendant.mmd'];

/** Shorter than this is a stub, not an arrow (the reported one was 11 px). */
const MIN_LENGTH = 24;
/** Two runs on one line that overlap by more than this are drawn over each other. */
const MAX_SHARED = 4;

type Point = readonly [number, number];
interface Run {
  readonly from: Point;
  readonly to: Point;
}

/** A path's points in order, curve control points included, and its straight (`L`) runs. */
function shape(d: string): { points: Point[]; runs: Run[] } {
  const points: Point[] = [];
  const runs: Run[] = [];
  for (const [, cmd, args] of d.matchAll(/([MLC])([^MLCZ]*)/g)) {
    const n = [...args!.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number);
    const at: Point[] = [];
    for (let i = 0; i + 1 < n.length; i += 2) at.push([n[i]!, n[i + 1]!]);
    const end = at[at.length - 1];
    if (cmd === 'L' && end && points.length > 0)
      runs.push({ from: points[points.length - 1]!, to: end });
    points.push(...at);
  }
  return { points, runs };
}

const length = (points: readonly Point[]): number =>
  points
    .slice(1)
    .reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]), 0);

/** How far two axis-aligned runs on the same line overlap; 0 when they don't. */
function shared(a: Run, b: Run): number {
  for (const axis of [0, 1] as const) {
    const other = axis === 0 ? 1 : 0;
    const flat = (r: Run) => Math.abs(r.from[axis] - r.to[axis]) < 0.5;
    if (!flat(a) || !flat(b) || Math.abs(a.from[axis] - b.from[axis]) >= 1) continue;
    const lo = Math.max(Math.min(a.from[other], a.to[other]), Math.min(b.from[other], b.to[other]));
    const hi = Math.min(Math.max(a.from[other], a.to[other]), Math.max(b.from[other], b.to[other]));
    return Math.max(0, hi - lo);
  }
  return 0;
}

describe('transitions between a composite and its own states (#416)', () => {
  it.each(FIXTURES)('%s: every transition is a visible arrow of its own', async (file) => {
    const { svg } = await createMermaid().render('s', readFileSync(join(DIR, file), 'utf8'));
    const edges = [
      ...svg.matchAll(
        /<g class="transition[^"]*" data-id="[^"]+" data-ast="([^"]+)"[^>]*>\s*<path[^>]* d="([^"]+)"/g
      ),
    ].map(([, ast, d]) => ({ ast: ast!, ...shape(d!) }));
    expect(edges.length).toBeGreaterThan(0);
    for (const e of edges) expect(length(e.points), e.ast).toBeGreaterThanOrEqual(MIN_LENGTH);
    for (const [i, a] of edges.entries())
      for (const b of edges.slice(i + 1))
        for (const ra of a.runs)
          for (const rb of b.runs)
            expect(shared(ra, rb), `${a.ast} and ${b.ast}`).toBeLessThanOrEqual(MAX_SHARED);
  });
});
