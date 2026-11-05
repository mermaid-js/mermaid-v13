import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { monarchFiles, OUT_DIR } from './monarch.ts';

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, text] of monarchFiles()) writeFileSync(join(OUT_DIR, name), text);
process.stdout.write(`Wrote the Monarch files to ${OUT_DIR}\n`);
