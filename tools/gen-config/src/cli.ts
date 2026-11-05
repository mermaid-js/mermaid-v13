/**
 * `pnpm gen:config` writes every file generated from the config schema;
 * `pnpm gen:config --check` fails instead when any of them is stale (R-CONF-4).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFragments } from './fragments.ts';
import { SCHEMA_PATH, SchemaError, generate } from './generate.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) =>
  existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : undefined;
const check = process.argv.includes('--check');

try {
  const { files } = await generate(read(SCHEMA_PATH) ?? '', read, findFragments(root));
  const stale = [...files].filter(([path, content]) => read(path) !== content).map(([p]) => p);
  if (check) {
    if (stale.length > 0) {
      process.stderr.write(
        `Stale generated config files (run \`pnpm gen:config\`):\n  ${stale.join('\n  ')}\n`
      );
      process.exitCode = 1;
    }
  } else {
    for (const path of stale) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), files.get(path)!);
      process.stdout.write(`wrote ${path}\n`);
    }
  }
} catch (error) {
  if (!(error instanceof SchemaError)) {
    throw error;
  }
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
