/**
 * The size report (#814, spec #813): lines by package and category, and gzip bytes per diagram
 * chunk for v13 and for the pinned Pele build. Other tickets of spec #813 quote its numbers.
 *
 * Lines are counted by `code-lines.ts` and sorted by `code-categories.ts`. Bytes come from the
 * bench's production build (`build.ts`, the bundle `measureCoreSize` makes), so the core and
 * loaded figures are the ones the size gates check.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Bundle } from './build.ts';
import { sizeOf } from './build.ts';
import { categoryOf } from './code-categories.ts';
import { countFileLines, listSourceFiles } from './code-lines.ts';
import { closureSize, flowchartClosureSize } from './size-budget.ts';

/** The root of this checkout. */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The category of a file no rule matches; `code-categories.spec.ts` keeps it empty on this tree. */
export const UNCLASSIFIED = 'unclassified';

export interface PackageLines {
  /** The folder under `packages/`. */
  pkg: string;
  total: number;
  /** Lines by category id; categories with no lines are left out. */
  byCategory: Record<string, number>;
}

export interface LineCounts {
  /** Every package with a counted file, by folder name. */
  packages: PackageLines[];
  /** Lines by category over every package, `tooling` included. */
  byCategory: Record<string, number>;
  /** Lines of the published packages: every category but `tooling` (spec #813's total). */
  total: number;
  /** Files no category matches. */
  unclassified: string[];
}

const add = (into: Record<string, number>, key: string, n: number) => {
  into[key] = (into[key] ?? 0) + n;
};

/** Lines by package and category of the checkout at `root`. */
export function measureLines(root: string): LineCounts {
  const packages = new Map<string, PackageLines>();
  const byCategory: Record<string, number> = {};
  const unclassified: string[] = [];
  for (const file of listSourceFiles(root)) {
    const n = countFileLines(root, file.path);
    const category = categoryOf(file.path) ?? UNCLASSIFIED;
    if (category === UNCLASSIFIED) unclassified.push(file.path);
    let entry = packages.get(file.pkg);
    if (entry === undefined)
      packages.set(file.pkg, (entry = { pkg: file.pkg, total: 0, byCategory: {} }));
    entry.total += n;
    add(entry.byCategory, category, n);
    add(byCategory, category, n);
  }
  const total = Object.entries(byCategory)
    .filter(([c]) => c !== 'tooling')
    .reduce((a, [, n]) => a + n, 0);
  return {
    packages: [...packages.values()].sort((a, b) => (a.pkg < b.pkg ? -1 : 1)),
    byCategory,
    total,
    unclassified,
  };
}

/** The size report: the `codeSize` field of a bench report, and `size-report`'s output. */
export interface CodeSizeReport {
  lines: LineCounts;
  /** Absent, with `pele`, when only lines were measured (`size-report --root`). */
  chunks?: ChunkSizes;
  pele?: PeleChunks;
}

/**
 * The full report for this checkout: lines from `root`, bytes from `bundle`, the production
 * build of the core entry that `measureStaticClosure` makes for the size gates.
 */
export function measureCodeSize(root: string, bundle: Bundle): CodeSizeReport {
  return { lines: measureLines(root), chunks: diagramChunks(bundle), pele: peleChunks() };
}

/** Gzip-9 bytes of one diagram's code. */
export interface DiagramChunk {
  /** The package folder (`diagram-pie`). */
  pkg: string;
  /** The diagram's own chunk, the one the registry imports. */
  chunk: number;
  /** What an SVG render of the diagram loads beyond core: the chunk and its static imports. */
  closure: number;
}

export interface ChunkSizes {
  /** R-PERF-8: the budget entry's static closure (the `core-size` gate). */
  core: number;
  /** R-PERF-1: core plus the flowchart chunk's closure (the static form of the `size` gate). */
  loaded: number;
  /** Every diagram package with a lazily imported chunk, by folder name. */
  diagrams: DiagramChunk[];
  /** Every output file of the build, core and chunks, each gzipped on its own. */
  total: number;
  files: number;
}

const DIAGRAM_ENTRY = /^packages\/(diagram-[^/]+)\/src\/index\.ts$/;
const gzipOf = (b: Bundle, paths: Iterable<string>) => {
  const set = new Set(paths);
  return b.files.filter((f) => set.has(f.path)).reduce((a, f) => a + f.gzip, 0);
};

/** Gzip bytes per diagram chunk of a production build of the core entry (`measureStaticClosure`). */
export function diagramChunks(b: Bundle): ChunkSizes {
  const core = closureSize(b);
  const inCore = new Set(core.files.map((f) => f.path));
  const diagrams: DiagramChunk[] = [];
  for (const [file, node] of Object.entries(b.graph)) {
    const pkg = DIAGRAM_ENTRY.exec(node.entryPoint ?? '')?.[1];
    if (pkg === undefined) continue;
    const beyond = closureSize(b, [file]).files.filter((f) => !inCore.has(f.path));
    diagrams.push({
      pkg,
      chunk: gzipOf(b, [file]),
      closure: beyond.reduce((a, f) => a + f.gzip, 0),
    });
  }
  return {
    core: core.gzip,
    loaded: flowchartClosureSize(b).gzip,
    diagrams: diagrams.sort((x, y) => (x.pkg < y.pkg ? -1 : 1)),
    total: b.files.reduce((a, f) => a + f.gzip, 0),
    files: b.files.length,
  };
}

/** Gzip-9 bytes of the published Pele build, each file on its own (as spec #813 measured it). */
export interface PeleChunks {
  version: string;
  /** `pele/core`: `dist/esm/core.js` and its static imports. */
  core: number;
  /** Each `pele/diagrams/<name>` entry: what it loads beyond core. */
  diagrams: { diagram: string; closure: number }[];
  /** Every file under `dist/esm`. */
  total: number;
  files: number;
}

/** Static `import`/`export … from` specifiers of an ES module (not `import()`). */
const STATIC_IMPORT = /\b(?:import|export)\s*(?:[\w$*{}\s,]*?\bfrom\s*)?["'](\.{1,2}\/[^"']+)["']/g;

/** The Pele package the bench depends on (`packages/bench/node_modules/pele`). */
const PELE_DIR = fileURLToPath(new URL('../node_modules/pele/', import.meta.url));

/** Gzip bytes of Pele's published ESM build, per diagram entry beyond core. */
export function peleChunks(dir: string = PELE_DIR): PeleChunks {
  const esm = join(dir, 'dist', 'esm');
  const files = new Map<string, Buffer>();
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name.endsWith('.js'))
        files.set(relative(esm, join(d, e.name)), readFileSync(join(d, e.name)));
    }
  };
  walk(esm);
  const gzip = new Map([...files].map(([p, bytes]) => [p, sizeOf(p, bytes).gzip]));
  const closure = (root: string): Set<string> => {
    const seen = new Set<string>();
    const visit = (p: string): void => {
      if (seen.has(p) || !files.has(p)) return;
      seen.add(p);
      for (const m of files.get(p)!.toString('utf8').matchAll(STATIC_IMPORT))
        visit(normalize(join(dirname(p), m[1]!)));
    };
    visit(root);
    return seen;
  };
  const sum = (paths: Iterable<string>) => [...paths].reduce((a, p) => a + gzip.get(p)!, 0);
  const core = closure('core.js');
  const diagrams = [...files.keys()]
    .filter((p) => /^diagrams\/[^/]+\.js$/.test(p))
    .map((p) => ({
      diagram: p.slice('diagrams/'.length, -'.js'.length),
      closure: sum([...closure(p)].filter((f) => !core.has(f))),
    }))
    .sort((x, y) => (x.diagram < y.diagram ? -1 : 1));
  const version = (
    JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string }
  ).version;
  return { version, core: sum(core), diagrams, total: sum(files.keys()), files: files.size };
}
