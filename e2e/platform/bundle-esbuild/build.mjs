// esbuild app (R-PLUG-4): both pages, ESM with code splitting, as an integrator builds it.
import { copyFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';

const pages = ['flowchart', 'all'];
const plugins = [];

await build({
  entryPoints: pages.map((p) => `src/${p}.js`),
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
  plugins,
});
mkdirSync('dist', { recursive: true });
for (const p of pages) copyFileSync(`${p}.html`, `dist/${p}.html`);
