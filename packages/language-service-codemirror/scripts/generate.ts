/**
 * `pnpm --filter @mermaid-js/language-service-codemirror gen` writes the Lezer parsers and their
 * map; with `--check` it lists the stale ones and fails instead (`pnpm check:static`, #694).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { GRAMMARS_MODULE, grammarsModule, lezerFiles, OUT_DIR } from './lezer.ts';

const files = new Map([...lezerFiles()].map(([name, text]) => [join(OUT_DIR, name), text]));
files.set(GRAMMARS_MODULE, grammarsModule());
const stale = [...files]
  .filter(([path, text]) => !existsSync(path) || readFileSync(path, 'utf8') !== text)
  .map(([path]) => path);
if (process.argv.includes('--check')) {
  if (stale.length > 0) {
    process.stderr.write(
      `Stale generated files (run \`pnpm --filter @mermaid-js/language-service-codemirror gen\`):\n  ${stale.join('\n  ')}\n`
    );
    process.exitCode = 1;
  }
} else {
  for (const path of stale) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, files.get(path)!);
    process.stdout.write(`wrote ${path}\n`);
  }
}
