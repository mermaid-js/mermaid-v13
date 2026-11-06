/**
 * Writes `corpus/<type>-v12-specs.json` for one Langium type, or for every one with `--all`:
 * the sources v12's specs and syntax page wrote for it (`src/langium-harvest.ts`).
 *
 * Usage: `pnpm --filter @mermaid-js/conformance harvest:langium <type>|--all`
 */
import { writeFileSync } from 'node:fs';
import { harvestLangium, LANGIUM_HARVEST, langiumHarvestPath } from '../langium-harvest.ts';
import type { LangiumHarvestType } from '../langium-harvest.ts';

const types = Object.keys(LANGIUM_HARVEST) as LangiumHarvestType[];
const arg = process.argv[2];
const isType = (t: string | undefined): t is LangiumHarvestType =>
  types.includes(t as LangiumHarvestType);

if (arg !== '--all' && !isType(arg)) {
  process.stderr.write(`usage: harvest:langium <${types.join('|')}> | --all\n`);
  process.exit(2);
}
for (const type of arg === '--all' ? types : [arg]) {
  const items = await harvestLangium(type);
  writeFileSync(langiumHarvestPath(type), JSON.stringify(items, null, 2) + '\n');
  process.stdout.write(`${type}: ${items.length} sources\n`);
}
