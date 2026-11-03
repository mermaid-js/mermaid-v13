/**
 * Experiment: are CPU instruction counts a stable enough measure to compare v13 with its base?
 *
 * For each comparison diagram, renderer and V8 setting, a fresh Node process renders the diagram
 * W times (warm-up only) and another renders it W + M times; the difference over M is the
 * instructions of one warm render, with Node's start-up and the warm-up left out. That is
 * repeated R times in fresh processes, and the spread of those repeats is the answer.
 *
 *   tsx --conditions=mermaid-source src/experiments/instructions.ts
 *
 * Tools: `perf stat -e instructions:u` when the machine exposes hardware counters (fast), and
 * Valgrind's cachegrind otherwise or as well (a simulated CPU: works anywhere, ~50x slower).
 * Prints a markdown report, and appends it to GITHUB_STEP_SUMMARY when set.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, buildSite, nodeEntry } from '../driver.ts';
import { loadFixtures } from '../fixtures.ts';
import { stripMermaidOnlyConfig } from '../normalize.ts';
import type { RendererId } from '../report.ts';

/** The comparison diagrams of the bench (packages/bench/src/compare.ts in #106). */
const COMPARE_DIAGRAMS = [
  { id: 'pele/flowchart-7', label: 'Small (7 nodes)' },
  { id: 'pele/flowchart-50', label: 'Medium (50 nodes)' },
  { id: 'pele/flowchart-500', label: 'Large (500 nodes)' },
  { id: 'perf/medium3', label: 'Subgraphs and edge labels' },
  {
    id: 'pr-check/12-should-render-a-flowchart-with-long-names-and-class-definitions',
    label: 'Long labels and classes',
  },
];

const OUT = join(SITE_DIR, '..', 'experiments');
mkdirSync(OUT, { recursive: true });

// The process that gets counted: plain JS, no tsx, so only Node and the renderer run.
const CHILD = join(OUT, 'render-n.mjs');
writeFileSync(
  CHILD,
  `import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [entry, file, count] = process.argv.slice(2);
const mod = await import(pathToFileURL(entry).href);
const src = readFileSync(file, 'utf8');
for (let i = 0; i < Number(count); i++) {
  const r = await mod.render('d' + i, src + '\\n%% run ' + i + '\\n');
  if (!String(r.svg ?? r).includes('<svg')) throw new Error('no svg');
}
`
);

type Tool = 'perf' | 'cachegrind';

function findPerf(): string | undefined {
  const candidates = [
    'perf',
    ...(existsSync('/usr/lib/linux-tools')
      ? readdirSync('/usr/lib/linux-tools').map((d) => `/usr/lib/linux-tools/${d}/perf`)
      : []),
  ];
  for (const p of candidates) {
    const r = spawnSync(p, ['stat', '-x,', '-e', 'instructions:u', '--', 'true'], {
      encoding: 'utf8',
    });
    if (r.status === 0 && /^\d+,/m.test(r.stderr)) return p;
  }
  return undefined;
}

function hasCachegrind(): boolean {
  return spawnSync('valgrind', ['--version'], { encoding: 'utf8' }).status === 0;
}

/** Instructions executed by one process rendering `file` `n` times. */
function count(
  tool: Tool,
  perf: string | undefined,
  flags: string[],
  entry: string,
  file: string,
  n: number
): number {
  const node = process.execPath;
  const args = [...flags, CHILD, entry, file, String(n)];
  if (tool === 'perf') {
    const r = spawnSync(perf!, ['stat', '-x,', '-e', 'instructions:u', '--', node, ...args], {
      encoding: 'utf8',
    });
    if (r.status !== 0) throw new Error(`perf failed: ${r.stderr.slice(-500)}`);
    const m = /^(\d+),/m.exec(r.stderr);
    if (!m) throw new Error(`no perf count in: ${r.stderr.slice(-500)}`);
    return Number(m[1]);
  }
  const r = spawnSync(
    'valgrind',
    [
      '--tool=cachegrind',
      '--cache-sim=no',
      '--smc-check=all-non-file',
      '--cachegrind-out-file=/dev/null',
      node,
      ...args,
    ],
    { encoding: 'utf8', maxBuffer: 1 << 26 }
  );
  if (r.status !== 0) throw new Error(`valgrind failed: ${r.stderr.slice(-800)}`);
  const m = /I\s+refs:\s+([\d,]+)/.exec(r.stderr);
  if (!m) throw new Error(`no cachegrind count in: ${r.stderr.slice(-500)}`);
  return Number(m[1]!.replace(/,/g, ''));
}

const stats = (xs: number[]) => {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, xs.length - 1));
  return { mean, cv: sd / mean, min: Math.min(...xs), max: Math.max(...xs) };
};

const log = (line: string) => process.stdout.write(line + '\n');
const perf = findPerf();
const tools: Tool[] = [
  ...(perf ? (['perf'] as const) : []),
  ...(hasCachegrind() ? (['cachegrind'] as const) : []),
];
log(
  `perf: ${perf ?? 'not available (no hardware counters, or not installed)'}; cachegrind: ${tools.includes('cachegrind') ? 'yes' : 'no'}`
);
if (tools.length === 0) throw new Error('Neither perf nor valgrind can count instructions here');

// v13-base from the same commit: identical code, a separately built bundle (as in the bench).
const site = await buildSite({ baseRef: 'HEAD' });
const entries: [RendererId, string][] = (['v13', 'v13-base'] as const).map((r) => [
  r,
  nodeEntry(site, r)!,
]);
const fixtures = loadFixtures();
const files = COMPARE_DIAGRAMS.map((d) => {
  const f = fixtures.find((x) => x.id === d.id)!;
  const file = join(OUT, d.id.replace(/\W/g, '_') + '.mmd');
  writeFileSync(file, stripMermaidOnlyConfig(f.source).source);
  return { ...d, file };
});

const PLAN: Record<Tool, { warm: number; measured: number; repeats: number }> = {
  perf: { warm: 20, measured: 20, repeats: 5 },
  cachegrind: { warm: 5, measured: 5, repeats: 3 },
};
const VARIANTS: [string, string[]][] = [
  ['default', []],
  ['--single-threaded', ['--single-threaded']],
];

const lines: string[] = ['# Instruction-count experiment', ''];
lines.push(
  `Runner: ${process.env.BENCH_RUNNER ?? 'local'}, ${process.version}, perf: ${perf ? 'yes' : 'no'}, cachegrind: ${tools.includes('cachegrind') ? 'yes' : 'no'}.`,
  ''
);
lines.push(
  'Per-render instructions = (count of W+M renders − count of W renders) / M, each count in a fresh process. CV is the variation over the repeats; "vs base" is v13 / v13-base (identical code, so 1.000 is right).',
  ''
);
for (const tool of tools) {
  const { warm, measured, repeats } = PLAN[tool];
  lines.push(`## ${tool} (W=${warm}, M=${measured}, ${repeats} repeats)`, '');
  lines.push(
    '| Diagram | V8 setting | v13 instructions/render | v13 CV | v13-base CV | vs base | min–max of v13 repeats |',
    '| --- | --- | --- | --- | --- | --- | --- |'
  );
  for (const d of files) {
    for (const [variant, flags] of VARIANTS) {
      const per: Record<string, number[]> = { v13: [], 'v13-base': [] };
      try {
        for (let k = 0; k < repeats; k++) {
          // Alternate renderers per repeat, like the bench.
          for (const [r, entry] of k % 2 === 0 ? entries : [...entries].reverse()) {
            const a = count(tool, perf, flags, entry, d.file, warm);
            const b = count(tool, perf, flags, entry, d.file, warm + measured);
            per[r]!.push((b - a) / measured);
          }
        }
      } catch (e) {
        lines.push(
          `| ${d.label} | ${variant} | failed: ${String((e as Error).message).split('\n')[0]} | | | | |`
        );
        log(`  ${tool} ${d.id} ${variant}: ${(e as Error).message}`);
        continue;
      }
      const a = stats(per.v13!);
      const b = stats(per['v13-base']!);
      const fmt = (x: number) => Math.round(x).toLocaleString('en-US');
      lines.push(
        `| ${d.label} | ${variant} | ${fmt(a.mean)} | ${(a.cv * 100).toFixed(2)}% | ${(b.cv * 100).toFixed(2)}% | ${(a.mean / b.mean).toFixed(3)} | ${fmt(a.min)}–${fmt(a.max)} |`
      );
      log(
        `  ${tool} ${d.id} ${variant}: v13 CV ${(a.cv * 100).toFixed(2)}%, base CV ${(b.cv * 100).toFixed(2)}%, ratio ${(a.mean / b.mean).toFixed(3)}`
      );
    }
  }
  lines.push('');
}
const md = lines.join('\n');
writeFileSync(join(OUT, 'instructions.md'), md + '\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
log(md);
