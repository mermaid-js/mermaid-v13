import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lezerFiles, OUT_DIR } from './lezer.ts';

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, text] of lezerFiles()) writeFileSync(join(OUT_DIR, name), text);
process.stdout.write(`Wrote the Lezer parsers to ${OUT_DIR}\n`);
