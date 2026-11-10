// D538's DDLT gates over every `dev-diagrams/layout-tests/swimlanes` fixture, with sizes from
// v13's measurer (`ddlt.fixtures.ts`): core's `validateLayout`, and v12's obstacle, corner and
// border-hugging checks (`ddltGates.ts`). v12's sweep (`ddlt/layout-fixtures.ddlt.spec.ts`) ran
// `validateLayout` on the fixtures that had captured sizes; here every fixture has them.
import { describe, expect, it } from 'vitest';
import { validateLayout } from '../../validate.ts';
import { validateSwimlanesLayout } from '../direction/validation.ts';
import { runSwimlane, swimlaneLayout } from '../swimlane.ts';
import { DDLT_FIXTURES, fixtureGraph } from './ddlt.fixtures.ts';
import { swimlaneGateIssues } from './ddltGates.ts';

/**
 * v12's allowed level-1 failures (`ddlt-manifest.json` `allowLevel1Failure`). D538 allows them
 * here too, but with v13's sizes all three pass, so they are gated like the rest: a regression
 * shows. Should one fail again, D538 lets it move to `KNOWN_FAILURES` with its issue.
 */
const ALLOWED_LEVEL1_FAILURES = new Set([
  'commant',
  '12-disagree-exits-b-c',
  '13-disagree-exits-b-c-d',
]);

/**
 * Fixtures that fail the gates with v13's sizes, reported on #595 with their reasons. Each must
 * fail with exactly these issues, so a fix or a change shows here.
 */
const KNOWN_FAILURES: Readonly<Record<string, readonly string[]>> = {
  // A labelled and an unlabelled edge leave I together; the second runs along the first's
  // label (v13's label is wider than v12's capture).
  '5-car-fun-sales-wide-tb': [
    'edge-border-hugging: Edge "L_I_K_0" hugs border of node "edge-label-L_I_J_0" for 36.2 units',
  ],
  // Never in v12's sweep (no sizes). Every node of one lane joins every node of the other.
  // Since LR routes on drawn sizes (`turnedRouting.ts`) only Dep2.Proc2's same-rank back edge
  // fails: `swapDestinationTerminalTailsToReduceCrossings` swaps its tail onto a rail along
  // Dep1.Proc2's top, through the node.
  'pebr-2-edge-intrudes-lane-label': [
    'edge-intersects-obstacle: Edge "L_Dep2.Proc2_Dep1.Proc2_0" intersects obstacle "Dep1.Proc2"',
    'edge-border-hugging: Edge "L_Dep2.Proc2_Dep1.Proc2_0" hugs border of node "Dep1.Proc2" for 92.0 units',
  ],
};

/** Every gate issue for a fixture, core's first. */
function gateIssues(id: string): string[] {
  const graph = fixtureGraph(id);
  const model = swimlaneLayout(graph, DDLT_FIXTURES[id]!.tuning);
  return [
    ...validateLayout(graph, model).map((p) => `validate: ${p}`),
    ...swimlaneGateIssues(graph, model).map((i) => `${i.type}: ${i.message}`),
  ];
}

const ids = Object.keys(DDLT_FIXTURES);

describe('swimlane DDLT fixtures', () => {
  it('cover every fixture, the regressions included', () => {
    expect(ids.length).toBeGreaterThanOrEqual(40);
    expect(ids).toContain('10-node-placement');
    expect(ids).toContain('regressions/title-band-rails');
    for (const id of [...ALLOWED_LEVEL1_FAILURES, ...Object.keys(KNOWN_FAILURES)])
      expect(ids).toContain(id);
  });

  it.each(ids)('%s holds the gates', (id) => {
    expect(gateIssues(id)).toEqual(KNOWN_FAILURES[id] ?? []);
  });

  it("returns v12's own validation issues as data (no logging)", () => {
    const data = runSwimlane(fixtureGraph('1-simple'));
    expect(validateSwimlanesLayout(data)).toEqual([]);
  });
});
