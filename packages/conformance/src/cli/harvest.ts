/**
 * Writes `corpus/<type>-v12-specs.json` for one jison type, or for every one with `--all`:
 * the sources v12's specs and syntax page wrote for it (`src/jison/harvest.ts`).
 *
 * Usage: `pnpm --filter @mermaid-js/conformance harvest <type>|--all`
 */
import { writeFileSync } from 'node:fs';
import { harvest, harvestPath } from '../jison/harvest.ts';
import { JISON_TYPES } from '../jison/types.ts';
import type { JisonType } from '../jison/types.ts';

const types = Object.keys(JISON_TYPES) as JisonType[];
const arg = process.argv[2];
const isType = (t: string | undefined): t is JisonType => types.includes(t as JisonType);

if (arg !== '--all' && !isType(arg)) {
  process.stderr.write(`usage: harvest <${types.join('|')}> | --all\n`);
  process.exit(2);
}
for (const type of arg === '--all' ? types : [arg]) {
  const items = harvest(type);
  writeFileSync(harvestPath(type), JSON.stringify(items, null, 2) + '\n');
  process.stdout.write(`${type}: ${items.length} sources\n`);
}
