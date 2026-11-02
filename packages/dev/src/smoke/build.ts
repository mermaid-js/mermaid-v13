/**
 * `pnpm --filter @mermaid-js/dev smoke:build`: bundles `entry.ts` against the BUILT packages
 * (`dist/`, so run `pnpm build` first) into `dist/smoke/smoke.mjs`, a single self-contained ES
 * module that Deno, a Web Worker and the three browsers load as is. `--source` bundles the
 * TypeScript sources instead (local runs without a build).
 */
import { join } from 'node:path';
import { build } from 'esbuild';

const outfile = join(import.meta.dirname, '..', '..', 'dist', 'smoke', 'smoke.mjs');
await build({
  entryPoints: [join(import.meta.dirname, 'entry.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  // One file: lazy diagram/theme chunks are inlined so every runtime loads one URL.
  splitting: false,
  target: 'es2022',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  conditions: process.argv.includes('--source') ? ['mermaid-source'] : [],
  logLevel: 'warning',
});
process.stdout.write(`smoke bundle -> ${outfile}\n`);
