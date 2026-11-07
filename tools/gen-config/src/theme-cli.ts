import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { THEME_VARIABLES } from '../../../packages/core/src/theme/index.ts';
import { INVENTORY_PATH, TABLE_PATH, themeInventory, themeTable } from './theme-inventory.ts';
import {
  generatedPath,
  packageTable,
  themePackages,
  vocabularyCollisions,
} from './theme-packages.ts';

const write = (path: string, text: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  process.stdout.write(`wrote ${path}\n`);
};

// Core's vocabulary and every `packages/diagram-*/src/theme/vocabulary.ts` (spec #414 T0b).
const packages = await themePackages(undefined, { tables: 'vocabulary' });
const collisions = vocabularyCollisions(THEME_VARIABLES, packages);
if (collisions.length > 0) {
  process.stderr.write(`theme names collide (D337):\n${collisions.join('\n')}\n`);
  process.exit(1);
}
for (const { dir, vocabulary } of packages)
  if (vocabulary) write(generatedPath(dir), packageTable(vocabulary));
write(TABLE_PATH, themeTable());
write(INVENTORY_PATH, await themeInventory(packages));
