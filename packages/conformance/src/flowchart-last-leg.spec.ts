import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { layered, type LayoutGraph, type LayoutModel, type Point } from '@mermaid-js/core/layout';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from './index.ts';

// #1186 (#1160 on the built-in engine), D684: under stepped routing the track an edge runs along
// in a gap keeps far enough from the node it heads into for the arrowhead, the lead before it
// and a full corner, so the line is not trimmed past its last bend and does not run into the
// head from the side.
const FIXTURE = 'e2e/diagrams/flowchart/nightly-check/1160-last-leg-before-arrowhead.mmd';
/**
 * The largest point arrowhead, the redux and neo themes' (`NEO_ARROWHEADS`), trims gap 4 +
 * length 10.5 - 1; the lead before a marker is 6 and the `rounded` corner radius 5
 * (`shared/src/svg/route.ts`). The classic themes' head trims 7, so it needs less.
 */
const LAST_LEG = 4 + (10.5 - 1) + 6 + 5;
/** Rounding left by subtracting two route coordinates. */
const EPS = 1e-6;

async function laidOut(
  source: string,
  theme: string
): Promise<{ graph: LayoutGraph; model: LayoutModel }> {
  const m = createMermaid();
  m.initialize({ deterministic: true, theme } as Parameters<typeof m.initialize>[0]);
  let out: { graph: LayoutGraph; model: LayoutModel } | undefined;
  m.registerLayoutLoaders(
    ['layered', 'dagre'].map((name) => ({
      name,
      loader: () =>
        Promise.resolve((graph: LayoutGraph) => {
          out = { graph, model: layered(graph) };
          return out.model;
        }),
    }))
  );
  await m.render('mermaid-0', source);
  if (!out) throw new Error('no layout captured');
  return out;
}

/** How far out of line a point may be and still count as on the line. */
const IN_LINE = 1e-6;

/** The route's points where it turns: its ends and every bend, not the points in line. */
function turns(points: readonly Point[]): Point[] {
  const out = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [out.at(-1)!, points[i]!, points[i + 1]!];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > IN_LINE) out.push(b);
  }
  out.push(points.at(-1)!);
  return out;
}

/** The lengths of the route's legs, from turn to turn. */
const legs = (route: readonly Point[]): number[] => {
  const points = turns(route);
  return points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
};

describe.each(['redux', 'neo'])('the last leg before an arrowhead, %s theme (#1186)', (theme) => {
  const source = readFileSync(join(REPO_ROOT, FIXTURE), 'utf8');

  it('is long enough for the head, its lead and a corner on every edge', async () => {
    const { graph, model } = await laidOut(source, theme);
    // Every edge in the fixture is `-->`: an arrowhead at the target.
    for (const e of graph.edges) {
      const points = model.edges.get(e.id)!.points;
      expect(legs(points).at(-1)!, e.id).toBeGreaterThanOrEqual(LAST_LEG - EPS);
    }
  });

  it('turns the step off the label track before that last leg', async () => {
    const { model } = await laidOut(source, theme);
    // `B -->|changes| A` steps from its label's track to A's end: a bend, then the last leg.
    expect(turns(model.edges.get('L_B_A_0')!.points).length).toBeGreaterThan(2);
  });

  it('leaves no leg shorter than 1px', async () => {
    const { graph, model } = await laidOut(source, theme);
    for (const e of graph.edges)
      for (const leg of legs(model.edges.get(e.id)!.points))
        expect(leg, e.id).toBeGreaterThanOrEqual(1);
  });
});
