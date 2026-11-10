/**
 * esbuild bundles for the bench: the production build whose size R-PERF-1 gates, and the bench
 * build with `__MERMAID_BENCH__` on for per-stage timing (R-PERF-5).
 */
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import type { BuildOptions, Metafile, Plugin } from 'esbuild';
import { stableCorePlan, stableCorePlugin } from './stable-chunks.ts';
import type { SizeSummary, SizedFile } from './report.ts';

/**
 * esbuild's working directory: the repo root, wherever the bench runs from. Metafile paths are
 * relative to it, and `isAsciiModule` matches them as `packages/<pkg>/src/ascii…` (R-ASCII-9).
 */
const ROOT = new URL('../../../', import.meta.url).pathname;

/** The define that turns stage timing on (bench) or compiles it out (production). */
export function benchDefine(bench: boolean): Record<string, string> {
  return { __MERMAID_BENCH__: bench ? 'true' : 'false' };
}

export interface BundleOptions {
  entry: string;
  outdir: string;
  bench: boolean;
  /** Extra directories searched for bare imports that normal resolution misses (esbuild `nodePaths`). */
  nodePaths?: string[];
  plugins?: Plugin[];
  /**
   * Bundle core's shared modules into one chunk, whichever lazy chunks import them (D313, the
   * CDN build does the same). Default on; off only to show the split it prevents.
   */
  stableCore?: boolean;
}

export interface Bundle {
  outdir: string;
  /** The entry's output file, relative to `outdir`. */
  entryFile: string;
  /** Every output file (entry and lazily imported chunks) with raw, gzip-9 and brotli-11 sizes. */
  files: SizedFile[];
  /** Output files reachable from the entry through static imports only, entry first. */
  staticClosure: string[];
  /** The import graph between output files (paths relative to `outdir`), for format splits. */
  graph: Record<string, OutputNode>;
}

export interface OutputNode {
  /** Source module of an entry or lazily imported chunk, relative to the working directory. */
  entryPoint?: string;
  imports: { path: string; kind: 'static' | 'dynamic' }[];
  /** Source modules bundled into this file, relative to the working directory. */
  inputs: string[];
}

/**
 * Totals over a set of sized files. The compressed totals are summed when first read, so a
 * caller that reads only gzip compresses nothing with brotli (see {@link sizeOf}).
 */
export function summarise(files: SizedFile[], source: SizeSummary['source']): SizeSummary {
  const total = (k: 'raw' | 'gzip' | 'brotli') => files.reduce((a, f) => a + f[k], 0);
  let gzip: number | undefined;
  let brotli: number | undefined;
  return {
    raw: total('raw'),
    get gzip() {
      return (gzip ??= total('gzip'));
    },
    set gzip(value) {
      gzip = value;
    },
    get brotli() {
      return (brotli ??= total('brotli'));
    },
    set brotli(value) {
      brotli = value;
    },
    source,
    files,
  };
}

/**
 * A file's raw, gzip-9 and brotli-11 sizes. Each compressed size is worked out when first read
 * and then kept: brotli-11 is slow, and most specs read the gzip size of a few files only. The
 * properties are enumerable, so reports and `toEqual` see plain numbers.
 */
export function sizeOf(path: string, bytes: Buffer): SizedFile {
  let gzip: number | undefined;
  let brotli: number | undefined;
  return {
    path,
    raw: bytes.length,
    get gzip() {
      return (gzip ??= gzipSync(bytes, { level: 9 }).length);
    },
    set gzip(value) {
      gzip = value;
    },
    get brotli() {
      return (brotli ??= brotliCompressSync(bytes, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }).length);
    },
    set brotli(value) {
      brotli = value;
    },
  };
}

function staticClosure(meta: Metafile, outdir: string, entryOut: string): string[] {
  const seen: string[] = [];
  const visit = (path: string) => {
    const rel = relative(outdir, path);
    if (seen.includes(rel)) return;
    seen.push(rel);
    for (const imp of meta.outputs[path]?.imports ?? []) {
      if (imp.kind === 'import-statement' && !imp.external) visit(imp.path);
    }
  };
  visit(entryOut);
  return seen;
}

export async function bundle({
  entry,
  outdir,
  bench,
  nodePaths = [],
  plugins = [],
  stableCore = true,
}: BundleOptions): Promise<Bundle> {
  const options = {
    entryPoints: [entry],
    outdir,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    metafile: true,
    absWorkingDir: ROOT,
    logLevel: 'silent',
    // Workspace packages bundle from their TypeScript sources, as tests and typecheck see them.
    conditions: ['mermaid-source'],
    // One entry per bundle, always published as index.js.
    entryNames: 'index',
    chunkNames: 'chunks/[name]-[hash]',
    define: benchDefine(bench),
    nodePaths,
    plugins,
  } satisfies BuildOptions;
  // D313: a first pass finds core's shared modules; the second anchors every lazy entry to them.
  const plan = stableCore
    ? stableCorePlan((await build({ ...options, write: false })).metafile, ROOT, entry)
    : undefined;
  const result = await build(
    plan ? { ...options, plugins: [...plugins, stableCorePlugin(plan)] } : options
  );
  const outputs = Object.keys(result.metafile.outputs).filter((p) => !p.endsWith('.map'));
  // Output paths in the metafile are relative to esbuild's working directory.
  const abs = (p: string) => new URL(p, `file://${ROOT}`).pathname;
  // Lazily imported chunks have an `entryPoint` too and may come first in the metafile.
  const entryOut = outputs.find(
    (p) =>
      result.metafile.outputs[p]?.entryPoint !== undefined &&
      abs(result.metafile.outputs[p].entryPoint) === abs(entry)
  );
  if (entryOut === undefined) throw new Error(`esbuild produced no entry output for ${entry}`);
  const meta: Metafile = {
    inputs: result.metafile.inputs,
    outputs: Object.fromEntries(
      Object.entries(result.metafile.outputs).map(([p, o]) => [
        abs(p),
        {
          ...o,
          imports: o.imports.map((i) => ({ ...i, path: i.external ? i.path : abs(i.path) })),
        },
      ])
    ),
  };
  const files = outputs.map((p) => sizeOf(relative(outdir, abs(p)), readFileSync(abs(p))));
  const graph: Record<string, OutputNode> = {};
  for (const p of outputs) {
    const o = result.metafile.outputs[p]!;
    graph[relative(outdir, abs(p))] = {
      ...(o.entryPoint !== undefined && { entryPoint: o.entryPoint }),
      imports: o.imports
        .filter(
          (i) => !i.external && (i.kind === 'import-statement' || i.kind === 'dynamic-import')
        )
        .map((i) => ({
          path: relative(outdir, abs(i.path)),
          kind: i.kind === 'dynamic-import' ? 'dynamic' : 'static',
        })),
      inputs: Object.keys(o.inputs),
    };
  }
  return {
    outdir,
    entryFile: relative(outdir, abs(entryOut)),
    files,
    staticClosure: staticClosure(meta, outdir, abs(entryOut)),
    graph,
  };
}
