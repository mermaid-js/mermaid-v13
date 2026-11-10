// Spike: where does each core module land, and who loads it?
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { buildCdn, ESM_FILE } from './cdn-build.ts';
const out = await buildCdn(mkdtempSync(join(tmpdir(), 'spike-cdn-')));
const PK = resolve(import.meta.dirname, '../..');
const rel = (p: string): string => relative(out.outdir, resolve(PK, p)).replaceAll('\\', '/');
const by = new Map(out.files.map((f) => [f.path, f]));
const closure = (roots: string[]): Set<string> => {
  const seen = new Set<string>();
  const visit = (p: string): void => { if (seen.has(p)) return; seen.add(p); for (const i of by.get(p)?.imports ?? []) visit(i); };
  roots.forEach(visit); return seen;
};
const core = closure([ESM_FILE]);
const diagrams = out.files.filter((f) => /^chunks\/diagram-[a-z0-9]+\.mjs$/.test(f.path)).map((f) => f.path);
const loaders = new Map<string, string[]>();
for (const d of diagrams) for (const c of closure([d])) loaders.set(c, [...(loaders.get(c) ?? []), d.slice(15, -4)]);
const filter = process.argv[2] ? new RegExp(process.argv[2]) : /^core\/src/;
for (const [o, info] of Object.entries(out.meta.outputs)) {
  if (o.endsWith('.map')) continue;
  const path = rel(o);
  const ins = Object.entries(info.inputs).filter(([i]) => filter.test(i)).sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput);
  if (ins.length === 0) continue;
  const who = core.has(path) ? 'CORE' : `${loaders.get(path)?.length ?? 0} diagrams`;
  console.log(`\n${path} gz=${by.get(path)?.gzip} [${who}]`);
  for (const [i, v] of ins.slice(0, 40)) console.log(`   ${v.bytesInOutput}\t${i}`);
}
