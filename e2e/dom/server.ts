/**
 * Page server for the DOM adapter specs (#16): esbuild bundles `page.ts` (the public `mermaid`
 * package from source) in memory and serves it with the pages in `www/`.
 */
import { join } from 'node:path';
import { context } from 'esbuild';

const port = Number(process.env.MERMAID_DOM_PORT ?? 9300);
const ctx = await context({
  entryPoints: { page: join(import.meta.dirname, 'page.ts') },
  outdir: join(import.meta.dirname, 'www', 'build'),
  write: false,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  conditions: ['mermaid-source'],
  sourcemap: 'inline',
  logLevel: 'warning',
});
await ctx.serve({ servedir: join(import.meta.dirname, 'www'), host: '127.0.0.1', port });
process.stdout.write(`DOM adapter pages on http://127.0.0.1:${port}/\n`);
