// esbuild app (spec #867, D587): the slim page, ESM with code splitting, as an integrator builds it.
import { copyFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';

await build({
  entryPoints: ['src/slim.js'],
  outdir: 'dist/src',
  bundle: true,
  format: 'esm',
  splitting: true,
  platform: 'browser',
  target: 'es2022',
  minify: true,
  // The test maps each chunk to the packages in it through its source map.
  sourcemap: true,
  logLevel: 'warning',
});
mkdirSync('dist', { recursive: true });
copyFileSync('slim.html', 'dist/slim.html');
