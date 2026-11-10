import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GRAMMARS_MODULE, grammarsModule, monarchFiles, OUT_DIR } from './monarch.ts';

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, text] of monarchFiles()) writeFileSync(join(OUT_DIR, name), text);
writeFileSync(GRAMMARS_MODULE, grammarsModule());
process.stdout.write(`Wrote the Monarch files to ${OUT_DIR} and their map to ${GRAMMARS_MODULE}\n`);
