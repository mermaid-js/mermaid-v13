import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { linearRatio } from '../linear-time.ts';

/**
 * The swimlane engine's time on a graph that is not a chain (#687, R-PERF, pitfall 5). The
 * crossing cleanup after routing (`resolveRenderedOrthogonalCrossings`) scored every candidate
 * reroute of every crossing edge by walking every pair of edges, so the 2 KB diagram below held
 * a CPU for 26 s. Through the public `renderSync()`, as a user reaches it; parsing and drawing
 * are linear and small beside the layout.
 *
 * The frame of the other stress specs (`../sankey/layout-stress.spec.ts`): n and 8n units, this
 * thread's CPU time, best of five, small and large alternating; linear reads ~8x, quadratic
 * ~64x and the bar is 24x. Before the fix this read above 100x; with it about 15x, because the
 * router still grows faster than its input (#726), which is also why the sizes stop at the
 * ticket's 40 nodes. Not measured on a steady machine: the bar is a ratio.
 *
 * The ticket's second shape, n labelled edges between the same two nodes (#726): three later
 * passes (the shared-track nudge, the rail channels and the jog shortcut) each tested a
 * candidate against every other edge or every pair of edges. Up to about ten edges the shape
 * has no crossing to clean up and costs next to nothing, so its sizes start at 20: 20 and 160
 * edges read about 22x before those passes were fixed and about 11x after.
 */

/** A fixed pseudo-random sequence (a 32-bit LCG), so the graph is the same on every run. */
function sequence(seed: number): (below: number) => number {
  let state = seed;
  return (below) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return Math.floor((state / 2 ** 32) * below);
  };
}

const LANES = 5;

/** The ticket's graph: five lanes, n nodes spread over them, 2n edges between random nodes. */
function randomEdgesAcrossLanes(n: number): string {
  const next = sequence(7);
  const lanes = Array.from({ length: LANES }, (_, lane) => {
    const nodes = [...Array(n).keys()].filter((j) => j % LANES === lane).map((j) => `    n${j}\n`);
    return `  subgraph L${lane}\n${nodes.join('')}  end\n`;
  });
  const edges = Array.from({ length: 2 * n }, () => `  n${next(n)} --> n${next(n)}\n`);
  return `swimlane-beta TB\n${lanes.join('')}${edges.join('')}`;
}

/** The ticket's second shape: n labelled edges between the same two nodes. */
const parallelLabelledEdges = (n: number): string =>
  `swimlane-beta LR\n${'  A -->|x| B\n'.repeat(n)}`;

const SHAPES: [string, (n: number) => string, number][] = [
  ['random edges across five lanes', randomEdgesAcrossLanes, 5],
  ['parallel labelled edges', parallelLabelledEdges, 20],
];

describe('stress: the swimlane layout does not blow up with the edge count (#687, #726)', () => {
  it.each(SHAPES)(
    '%s',
    async (_name, build, n) => {
      const options = { config: { deterministic: true } };
      const mermaid = createMermaid();
      const [small, large] = [build(n), build(8 * n)];
      await mermaid.prepare(small, options);
      const draw = (text: string) => () => mermaid.renderSync(text, options);
      expect(linearRatio(draw(small), draw(large))).toBeLessThan(24);
    },
    600_000
  );
});
