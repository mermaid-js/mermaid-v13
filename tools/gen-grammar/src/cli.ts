/**
 * `pnpm gen:grammar` writes every file generated from the grammar files;
 * `pnpm gen:grammar --check` fails instead when any of them is stale (R-PARSE-9).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from './generate.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) =>
  existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : undefined;
const check = process.argv.includes('--check');

const files = generate(read);
const stale = [...files].filter(([path, content]) => read(path) !== content).map(([p]) => p);
if (check) {
  if (stale.length > 0) {
    process.stderr.write(
      `Stale files generated from grammar files (run \`pnpm gen:grammar\`):\n  ${stale.join('\n  ')}\n`
    );
    process.exitCode = 1;
  }
} else {
  for (const path of stale) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), files.get(path) ?? '');
    process.stdout.write(`wrote ${path}\n`);
  }
}
