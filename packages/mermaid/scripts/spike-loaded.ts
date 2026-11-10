import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCdn, ESM_FILE } from './cdn-build.ts';
const out = await buildCdn(mkdtempSync(join(tmpdir(), 'spike-cdn-')));
const by = new Map(out.files.map((f) => [f.path, f]));
const closure = (roots: string[]): Set<string> => {
  const seen = new Set<string>();
  const visit = (p: string): void => { if (seen.has(p)) return; seen.add(p); for (const i of by.get(p)?.imports ?? []) visit(i); };
  roots.forEach(visit); return seen;
};
const size = (s: Set<string>): number => [...s].reduce((n, p) => n + by.get(p)!.gzip, 0);
const res: Record<string, number> = { core: size(closure([ESM_FILE])) };
for (const f of out.files) {
  const m = /^chunks\/diagram-([a-z0-9]+)\.mjs$/.exec(f.path);
  if (m) res[m[1]!] = size(closure([ESM_FILE, f.path]));
}
res.allMjs = out.files.filter((f) => f.path.endsWith('.mjs')).reduce((n, f) => n + f.gzip, 0);
res.allDiagramsLoaded = size(closure([ESM_FILE, ...out.files.filter((f) => /^chunks\/diagram-[a-z0-9]+\.mjs$/.test(f.path)).map((f) => f.path)]));
writeFileSync(process.argv[2]!, JSON.stringify(res));
