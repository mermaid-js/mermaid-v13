import { writeFileSync } from 'node:fs';
import { INVENTORY_PATH, themeInventory } from './theme-inventory.ts';

writeFileSync(INVENTORY_PATH, await themeInventory());
process.stdout.write(`wrote ${INVENTORY_PATH}\n`);
