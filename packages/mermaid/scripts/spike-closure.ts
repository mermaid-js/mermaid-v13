import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCdn, ESM_FILE } from './cdn-build.ts';
const out = await buildCdn(mkdtempSync(join(tmpdir(), 'spike-cdn-')));
const by = new Map(out.files.map((f) => [f.path, f]));
const closure = (root: string): string[] => {
  const seen = new Set<string>();
  const visit = (p: string): void => { if (seen.has(p)) return; seen.add(p); for (const i of by.get(p)?.imports ?? []) visit(i); };
  visit(root); return [...seen];
};
const core = new Set(closure(ESM_FILE));
for (const d of process.argv.slice(2)) {
  const extra = closure(`chunks/diagram-${d}.mjs`).filter((p) => !core.has(p));
  console.log(d, 'core', [...core].reduce((n, p) => n + by.get(p)!.gzip, 0), 'extra:');
  for (const p of extra) {
    const src = readFileSync(join(out.outdir, p), 'utf8');
    const hints = ['RuleLexer','StateLexer','routePath','openSvgRoot','wordRange','asciiDropped','keywordCompletions','configNumber','layered','markdown'].filter((h) => src.includes(h));
    console.log('  ', p, by.get(p)!.gzip, src.length, hints.join(','));
  }
}
