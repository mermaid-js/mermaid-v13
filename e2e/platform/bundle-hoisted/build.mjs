// D589 app: the bundle-pages plugin page, built with esbuild and the Mermaid bundler plugin.
// npm hoists mermaid-fixture-diagram (a dependency of mermaid-fixture-wrapper) to the top of
// node_modules; the app does not declare it, so discovery must leave it out.
import { copyFileSync, mkdirSync } from 'node:fs';
import mermaid from '@mermaid-js/bundler-plugin/esbuild';
import { build } from 'esbuild';

await build({
  entryPoints: ['src/plugin.js'],
  outdir: 'dist/src',
  bundle: true,
  format: 'esm',
  splitting: true,
  platform: 'browser',
  target: 'es2022',
  minify: true,
  logLevel: 'warning',
  plugins: [mermaid()],
});
mkdirSync('dist', { recursive: true });
copyFileSync('plugin.html', 'dist/plugin.html');
