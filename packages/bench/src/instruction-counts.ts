/**
 * The Node comparison by CPU instruction counts instead of time, when the machine has hardware
 * counters (`perf stat -e instructions:u`). On the CI runner they are about 50x steadier than
 * timing: 0.05-1.4% between repeats against ±8-38% intervals for times.
 *
 * One measurement: a fresh `node --single-threaded` process renders a diagram W times (warm-up)
 * and another renders it W + M times; the difference over M is one warm render, with Node's
 * start-up and the warm-up left out. `--single-threaded` keeps V8's compiler and GC work on the
 * main thread at the points the code reaches, rather than on background threads whose timing
 * varies; without it the counts varied by up to 7%. M is sized per diagram so each measurement
 * covers about the same number of instructions, which keeps small diagrams from being noisy.
 *
 * Instructions are not time (a slowdown in memory access does not show), so the browser keeps
 * timing, and the counts are only compared within one run, on one machine.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Site } from './driver.ts';
import { SITE_DIR, nodeEntry, versionOf } from './driver.ts';
import type { Fixture } from './fixtures.ts';
import { rotation } from './interleave.ts';
import { stripMermaidOnlyConfig } from './normalize.ts';
import type { RendererId } from './report.ts';

const DIR = join(SITE_DIR, 'instructions');
const CHILD = join(DIR, 'render-n.mjs');

// The counted process: plain JS, so only Node and the renderer run. Limits are lifted as in the
// bench adapters. v13 takes `render(id, text)`, Pele `render(text, options)`.
const CHILD_SOURCE = `import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [kind, entry, file, count] = process.argv.slice(2);
const mod = await import(pathToFileURL(entry).href);
const src = readFileSync(file, 'utf8');
const lifted = { maxTextSize: 10000000, maxEdges: 1000000 };
if (kind === 'v13' && typeof mod.initialize === 'function') mod.initialize(lifted);
const pele = { limit: lifted.maxTextSize, maxEdges: lifted.maxEdges, outputLimit: Number.MAX_SAFE_INTEGER };
for (let i = 0; i < Number(count); i++) {
  const text = src + '\\n%% run ' + i + '\\n';
  const r = kind === 'pele' ? mod.render(text, pele) : await mod.render('d' + i, text);
  if (!String(r.svg ?? r).includes('<svg')) throw new Error('no svg');
}
`;

/**
 * A `perf` that can count user-space instructions here, or undefined. BENCH_PERF names one;
 * otherwise `perf` on the PATH and the versioned binaries of Ubuntu's linux-tools are tried.
 */
export function findPerf(): string | undefined {
  const tools = '/usr/lib/linux-tools';
  const candidates = [
    ...(process.env.BENCH_PERF ? [process.env.BENCH_PERF] : []),
    'perf',
    ...(existsSync(tools) ? readdirSync(tools).map((d) => join(tools, d, 'perf')) : []),
  ];
  for (const p of candidates) {
    const r = spawnSync(p, ['stat', '-x,', '-e', 'instructions:u', '--', 'true'], {
      encoding: 'utf8',
    });
    if (r.status === 0 && /^\d+,/m.test(r.stderr)) return p;
  }
  return undefined;
}

/** Instructions of one fresh process rendering `file` `n` times. */
function count(perf: string, kind: string, entry: string, file: string, n: number): number {
  const args = ['--single-threaded', CHILD, kind, entry, file, String(n)];
  const r = spawnSync(
    perf,
    ['stat', '-x,', '-e', 'instructions:u', '--', process.execPath, ...args],
    {
      encoding: 'utf8',
    }
  );
  const m = /^(\d+),/m.exec(r.stderr);
  if (r.status !== 0 || !m)
    throw new Error(`perf stat failed: ${r.stderr.trim().split('\n').pop() ?? ''}`);
  return Number(m[1]);
}

/** A diagram of the PR check, with the name the comment shows for it. */
export interface NamedDiagram {
  id: string;
  label: string;
}

export interface InstructionRenderer {
  renderer: RendererId;
  version: string;
  /** Why counting failed for this renderer (perf, or the render threw). */
  error?: string;
}

export interface InstructionDiagram extends NamedDiagram {
  /** Measured renders per count (M), sized so a count covers about `target` instructions. */
  measured: number;
  /** Instructions per warm render, per repeat: `counts[renderer][repeat]`; null if it failed. */
  counts: Partial<Record<RendererId, (number | null)[]>>;
}

export interface InstructionRun {
  repeats: number;
  renderers: InstructionRenderer[];
  diagrams: InstructionDiagram[];
}

export interface InstructionOptions {
  perf: string;
  site: Site;
  /** Node-capable renderers (v13 first is expected; v13-base and Pele are compared with it). */
  renderers: RendererId[];
  diagrams: { diagram: NamedDiagram; fixture: Fixture }[];
  repeats: number;
  /** Warm-up renders before the measured ones. */
  warm: number;
  /** Instructions each measurement should cover; M is chosen per diagram to reach it. */
  target: number;
  log: (line: string) => void;
}

/** 3 repeats is enough at ~1% variation; 1e9 instructions per count keeps small diagrams steady. */
export const INSTRUCTION_DEFAULTS = { repeats: 3, warm: 20, target: 1e9 } as const;
const MIN_MEASURED = 10;
const MAX_MEASURED = 500;

/** Instructions per warm render of every diagram on every renderer, `repeats` times. */
export function countInstructions(o: InstructionOptions): InstructionRun {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(CHILD, CHILD_SOURCE);
  const entries = new Map<RendererId, string>();
  const info: InstructionRenderer[] = [];
  for (const r of o.renderers) {
    const entry = nodeEntry(o.site, r);
    if (r === 'v13-base' && !o.site.base) {
      info.push({
        renderer: r,
        version: 'unknown',
        error: o.site.baseError ?? 'not built',
      });
      continue;
    }
    if (entry === undefined) continue;
    entries.set(r, entry);
    info.push({
      renderer: r,
      version: r === 'v13-base' ? o.site.base!.version : versionOf(r),
    });
  }
  const kindOf = (r: RendererId) => (r === 'pele' ? 'pele' : 'v13');
  const active = o.renderers.filter((r) => entries.has(r));
  o.log(
    `Counting instructions of ${active.join(', ')} in Node on ${o.diagrams.length} diagrams, ${o.repeats} repeats`
  );
  const diagrams: InstructionDiagram[] = [];
  for (const { diagram, fixture } of o.diagrams) {
    const row: Partial<Record<RendererId, (number | null)[]>> = {};
    for (const r of o.renderers) row[r] = Array<number | null>(o.repeats).fill(null);

    const file = join(DIR, diagram.id.replace(/\W/g, '_') + '.mmd');
    writeFileSync(file, stripMermaidOnlyConfig(fixture.source).source);
    const per = (r: RendererId, m: number) => {
      const e = entries.get(r)!;
      return (
        (count(o.perf, kindOf(r), e, file, o.warm + m) -
          count(o.perf, kindOf(r), e, file, o.warm)) /
        m
      );
    };
    let measured = MIN_MEASURED;
    try {
      // A short pilot on the first renderer sizes M for this diagram.
      const pilot = per(active[0]!, MIN_MEASURED);
      measured = Math.min(
        MAX_MEASURED,
        Math.max(MIN_MEASURED, Math.ceil(o.target / Math.max(pilot, 1)))
      );
    } catch (e) {
      o.log(`  ${diagram.id}: pilot failed: ${(e as Error).message}`);
    }
    const measure = (r: RendererId, k: number) => {
      try {
        row[r]![k] = per(r, measured);
      } catch (e) {
        const known = info.find((x) => x.renderer === r);
        if (known && known.error === undefined) known.error = (e as Error).message;
      }
    };
    for (let k = 0; k < o.repeats; k++) for (const r of rotation(active, k)) measure(r, k);
    diagrams.push({ ...diagram, measured, counts: row });
    o.log(`  ${diagram.id}: ${measured} measured renders per count`);
  }
  return { repeats: o.repeats, renderers: info, diagrams };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Median instructions per render of a renderer on a diagram, or null when none counted. */
export function medianCount(d: InstructionDiagram, r: RendererId): number | null {
  const xs = (d.counts[r] ?? []).filter((x): x is number => x !== null);
  return xs.length === 0 ? null : median(xs);
}

/**
 * How `a`'s count changed against `b`'s: the median of the per-repeat ratios minus one, with
 * the smallest and largest of them (repeats are paired: both were counted in the same repeat).
 */
export function countChange(
  d: InstructionDiagram,
  a: RendererId,
  b: RendererId
): { change: number; low: number; high: number } | null {
  const xs = d.counts[a] ?? [];
  const ys = d.counts[b] ?? [];
  const ratios: number[] = [];
  for (let k = 0; k < Math.min(xs.length, ys.length); k++) {
    const x = xs[k];
    const y = ys[k];
    if (x !== null && x !== undefined && y !== null && y !== undefined && y > 0)
      ratios.push(x / y - 1);
  }
  if (ratios.length === 0) return null;
  return { change: median(ratios), low: Math.min(...ratios), high: Math.max(...ratios) };
}
