/**
 * Writes `corpus/cynefin-v12-specs.json` from {@link harvestCynefin} (the v12 cynefin spec
 * strings, examples and syntax-page fences at `fa796a943`), a parity corpus next to the e2e
 * fixtures (R-TEST-3, DESIGN §13.1).
 *
 * Usage: `pnpm --filter @mermaid-js/conformance harvest:cynefin`
 */
import { writeFileSync } from 'node:fs';
import { CYNEFIN_HARVEST_PATH, harvestCynefin } from '../cynefin/harvest.ts';

const items = harvestCynefin();
writeFileSync(CYNEFIN_HARVEST_PATH, JSON.stringify(items, null, 2) + '\n');
process.stdout.write(`${items.length} sources\n`);
