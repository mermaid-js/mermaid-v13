/**
 * `pnpm regen`'s first step (`sync.ts`): rewrites the package.json diagram dependencies and the
 * RELEASING.md diagram rows from the diagram packages. `--check` lists stale files and fails.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './diagrams.ts';
import { staleFiles, syncedFiles } from './sync.ts';

const stale = staleFiles();
if (process.argv.includes('--check')) {
  if (stale.length > 0) {
    process.stderr.write(`Stale workspace files (run \`pnpm regen\`):\n  ${stale.join('\n  ')}\n`);
    process.exitCode = 1;
  }
} else {
  const files = syncedFiles();
  for (const path of stale) {
    writeFileSync(join(ROOT, path), files.get(path)!);
    process.stdout.write(`wrote ${path}\n`);
  }
}
