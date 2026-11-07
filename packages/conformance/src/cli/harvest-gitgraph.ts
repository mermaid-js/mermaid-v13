/**
 * Writes `corpus/gitGraph-v12-specs.json` (`../gitgraph/harvest.ts`).
 *
 * Usage: `pnpm --filter @mermaid-js/conformance harvest:gitgraph`
 */
import { writeFileSync } from 'node:fs';
import { GITGRAPH_HARVEST, harvestGitGraph } from '../gitgraph/harvest.ts';

const items = harvestGitGraph();
writeFileSync(GITGRAPH_HARVEST, JSON.stringify(items, null, 2) + '\n');
process.stdout.write(`${items.length} sources\n`);
