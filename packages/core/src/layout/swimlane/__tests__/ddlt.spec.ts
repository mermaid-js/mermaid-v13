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
import v12Fixtures from './v12Fixtures.json' with { type: 'json' };

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
 * Fixtures that fail the gates with v13's sizes, each with its issue and exactly the issues it
 * fails with, so a fix or a change shows here. None since #634 and #636 were fixed in the engine
 * (`ddltRegressions.spec.ts`); D538 has no other allowance.
 */
const KNOWN_FAILURES: Readonly<Record<string, readonly string[]>> = {};

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

/**
 * Fixtures not in v12's folder at the port baseline: the fixtures of v12 fixes merged or opened
 * after it, which come over as fixtures (#683, #709).
 */
const V13_ONLY: readonly string[] = [
  // mermaid-js/mermaid#8407
  'regressions/opposite-edges-gap',
  // mermaid-js/mermaid#8698
  'regressions/same-lane-back-edge-lr',
  'regressions/same-lane-detour-tb',
  // mermaid-js/mermaid#8693
  'regressions/terminal-lanes-keep-straight-connector',
  // mermaid-js/mermaid#8695
  'regressions/edge-end-on-box',
  // mermaid-js/mermaid#8754
  'regressions/tb-empty-lane',
  // mermaid-js/mermaid#8770
  'regressions/locale-independent-order',
  // mermaid-js/mermaid#8772
  'regressions/lr-empty-lane',
  // mermaid-js/mermaid#8788
  'regressions/tb-empty-lane-tight-spacing',
  'regressions/tb-empty-first-lane-auto-order',
  'regressions/tb-lanes-keep-padding-tight-spacing',
];

describe('swimlane DDLT fixtures', () => {
  it('cover every fixture, the regressions included', () => {
    // Compared with v12's list, not with a floor (#678, #695): a v12 fixture is in the sweep
    // unless `v12Fixtures.json` lists it under `notPorted` with the issue that tracks it, and
    // a fixture v12 does not have is named in `V13_ONLY`.
    const notPorted = Object.keys(v12Fixtures.notPorted);
    for (const id of notPorted) expect(v12Fixtures.fixtures).toContain(id);
    const expected = [...v12Fixtures.fixtures.filter((id) => !notPorted.includes(id)), ...V13_ONLY];
    expect([...ids].sort()).toEqual(expected.sort());
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
