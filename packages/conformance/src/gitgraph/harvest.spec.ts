import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hasV12History } from '../jison/harvest.ts';
import { GITGRAPH_HARVEST, harvestGitGraph } from './harvest.ts';

/**
 * The committed `corpus/gitGraph-v12-specs.json` is what `harvest:gitgraph` writes today, so the
 * corpus and the CLI cannot drift apart. Needs v12's history (`fa796a943`); a shallow clone
 * lacks it and skips.
 */
describe.skipIf(!hasV12History())('gitGraph harvest', () => {
  it('writes the committed corpus', () => {
    expect(existsSync(GITGRAPH_HARVEST), 'run `harvest:gitgraph`').toBe(true);
    const items = harvestGitGraph();
    // gitGraph.spec.ts 69 parse calls, parser gitGraph.test.ts 27, the syntax page 35.
    expect(items.length).toBe(131);
    expect(items).toEqual(JSON.parse(readFileSync(GITGRAPH_HARVEST, 'utf8')));
  }, 60_000);
});
