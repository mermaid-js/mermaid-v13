// Spike only: prints gzip sizes of the CDN build per chunk.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCdn, closureGzip, ESM_FILE } from './cdn-build.ts';

const out = await buildCdn(mkdtempSync(join(tmpdir(), 'spike-cdn-')));
const files = out.files.filter((f) => f.path.endsWith('.mjs'));
const rows = files.map((f) => ({ path: f.path, gzip: f.gzip, bytes: f.bytes }));
const core = closureGzip(out.files, ESM_FILE);
const closure = (root: string): number => closureGzip(out.files, root);
const diagrams = rows.filter((r) => /chunks\/diagram-[a-z0-9]+\.mjs$/.test(r.path));
const result = {
  core,
  totalGzip: rows.reduce((s, r) => s + r.gzip, 0),
  totalBytes: rows.reduce((s, r) => s + r.bytes, 0),
  files: rows.length,
  diagrams: Object.fromEntries(
    diagrams.map((d) => [d.path.slice(15, -4), { own: d.gzip, loaded: closure(d.path) }])
  ),
  rows,
};
writeFileSync(process.argv[2]!, JSON.stringify(result, null, 1));
console.log(JSON.stringify({ core, totalGzip: result.totalGzip, totalBytes: result.totalBytes, files: rows.length }));
