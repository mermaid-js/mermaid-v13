// Spike: time each diagram's public token function and parse function over its e2e corpus.
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.argv[2]!, outFile = process.argv[3]!, rounds = Number(process.argv[4] ?? 15);
const DIR: Record<string, string[]> = { class: ['class-diagram'], er: ['er-diagram'], gitgraph: ['git'], quadrant: ['quadrant-chart'], state: ['state-diagram-v2', 'state-diagram'], treeview: ['tree-view'] };
const walk = (d: string): string[] => existsSync(d) ? readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.mmd') ? [p] : []; }) : [];
const only = process.argv[5]?.split(',');
const types = readdirSync(join(root, 'packages')).filter((p) => p.startsWith('diagram-')).map((p) => p.slice(8)).sort().filter((t) => !only || only.includes(t));
const res: Record<string, unknown> = {};
for (const t of types) {
  const mods: Record<string, unknown>[] = [];
  for (const f of ['index.ts', 'tokens-api.ts', 'parser.ts']) {
    const p = join(root, 'packages', `diagram-${t}`, 'src/parser', f);
    if (existsSync(p)) mods.push((await import(pathToFileURL(p).href)) as Record<string, unknown>);
  }
  const find = (rx: RegExp): ((s: string) => unknown) | undefined => {
    for (const m of mods) for (const [k, v] of Object.entries(m)) if (rx.test(k) && typeof v === 'function') return v as (s: string) => unknown;
    return undefined;
  };
  const tokens = find(/Tokens$/), parse = find(/^parse[A-Z]\w*$/);
  const srcs = (DIR[t] ?? [t]).flatMap((d) => walk(join(root, 'e2e/diagrams', d))).sort().map((f) => readFileSync(f, 'utf8'));
  const chars = srcs.reduce((n, s) => n + s.length, 0);
  const time = (fn: ((s: string) => unknown) | undefined): { min: number; med: number; ok: number } | undefined => {
    if (!fn || srcs.length === 0) return undefined;
    let ok = 0; const good = srcs.filter((s) => { try { fn(s); return true; } catch { return false; } }); ok = good.length;
    if (ok === 0) return undefined;
    const reps = Math.max(1, Math.ceil(400_000 / Math.max(1, good.reduce((n, s) => n + s.length, 0))));
    const run = (): number => { const t0 = performance.now(); for (let r = 0; r < reps; r++) for (const s of good) fn(s); return (performance.now() - t0) / reps; };
    for (let i = 0; i < 5; i++) run();
    const ts = Array.from({ length: rounds }, run).sort((a, b) => a - b);
    return { min: ts[0]!, med: ts[ts.length >> 1]!, ok };
  };
  res[t] = { files: srcs.length, chars, tokens: time(tokens), parse: time(parse) };
}
writeFileSync(outFile, JSON.stringify(res));
