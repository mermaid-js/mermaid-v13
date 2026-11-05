// cspell:words mathjax
/**
 * `pnpm build` for the plugin, after `tsc`: replaces tsc's `dist/engine.js`, which would import
 * MathJax at run time, with the bundle (`bundle.ts`), and prints its size.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { engineBuild, PACKAGE_DIR } from './bundle.ts';

const outfile = join(PACKAGE_DIR, 'dist', 'engine.js');
await build(engineBuild(outfile));
const bytes = readFileSync(outfile);
process.stdout.write(
  `dist/engine.js: ${bytes.length} B, ${gzipSync(bytes, { level: 9 }).length} B gz\n`
);
