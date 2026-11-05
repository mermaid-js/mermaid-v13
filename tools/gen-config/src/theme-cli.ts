import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { INVENTORY_PATH, TABLE_PATH, themeInventory, themeTable } from './theme-inventory.ts';

writeFileSync(INVENTORY_PATH, await themeInventory());
process.stdout.write(`wrote ${INVENTORY_PATH}\n`);
mkdirSync(dirname(TABLE_PATH), { recursive: true });
writeFileSync(TABLE_PATH, themeTable());
process.stdout.write(`wrote ${TABLE_PATH}\n`);
