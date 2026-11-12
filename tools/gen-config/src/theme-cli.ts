/**
 * `pnpm gen:theme` writes the theme tables and the variable inventory;
 * `pnpm gen:theme --check` fails instead when any of them is stale.
 */
import { THEME_VARIABLES } from '../../../packages/core/src/theme/index.ts';
import { emit } from './emit.ts';
import { INVENTORY_PATH, TABLE_PATH, themeInventory, themeTable } from './theme-inventory.ts';
import {
  generatedPath,
  packageTable,
  themePackages,
  vocabularyCollisions,
} from './theme-packages.ts';

// Core's vocabulary and every `packages/diagram-*/src/theme/vocabulary.ts` (spec #414 T0b).
const packages = await themePackages(undefined, { tables: 'vocabulary' });
const collisions = vocabularyCollisions(THEME_VARIABLES, packages);
if (collisions.length > 0) {
  process.stderr.write(`theme names collide (D337):\n${collisions.join('\n')}\n`);
  process.exit(1);
}
const files = new Map<string, string>();
for (const { dir, vocabulary } of packages)
  if (vocabulary) files.set(generatedPath(dir), packageTable(vocabulary));
files.set(TABLE_PATH, themeTable());
files.set(INVENTORY_PATH, await themeInventory(packages));
if (!emit(files, { check: process.argv.includes('--check'), step: 'pnpm gen:theme' }))
  process.exitCode = 1;
