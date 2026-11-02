/**
 * esbuild bundles for the bench: the production build whose size R-PERF-1 gates, and the bench
 * build with `__MERMAID_BENCH__` on for per-stage timing (R-PERF-5).
 */
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import type { Metafile } from 'esbuild';
import type { SizedFile } from './report.ts';

/** The define that turns stage timing on (bench) or compiles it out (production). */
export function benchDefine(bench: boolean): Record<string, string> {
  return { __MERMAID_BENCH__: bench ? 'true' : 'false' };
}

export interface BundleOptions {
  entry: string;
  outdir: string;
  bench: boolean;
}

export interface Bundle {
  outdir: string;
  /** The entry's output file, relative to `outdir`. */
  entryFile: string;
  /** Every output file (entry and lazily imported chunks) with raw, gzip-9 and brotli-11 sizes. */
  files: SizedFile[];
  /** Output files reachable from the entry through static imports only, entry first. */
  staticClosure: string[];
}

export function sizeOf(path: string, bytes: Buffer): SizedFile {
  return {
    path,
    raw: bytes.length,
    gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
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

export async function bundle({ entry, outdir, bench }: BundleOptions): Promise<Bundle> {
  const result = await build({
    entryPoints: [entry],
    outdir,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    metafile: true,
    logLevel: 'silent',
    // Workspace packages bundle from their TypeScript sources, as tests and typecheck see them.
    conditions: ['mermaid-source'],
    // One entry per bundle, always published as index.js.
    entryNames: 'index',
    chunkNames: 'chunks/[name]-[hash]',
    define: benchDefine(bench),
  });
  const outputs = Object.keys(result.metafile.outputs).filter((p) => !p.endsWith('.map'));
  // Output paths in the metafile are relative to the working directory.
  const abs = (p: string) => new URL(p, `file://${process.cwd()}/`).pathname;
  const entryOut = outputs.find((p) => result.metafile.outputs[p]?.entryPoint !== undefined);
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
  return {
    outdir,
    entryFile: relative(outdir, abs(entryOut)),
    files,
    staticClosure: staticClosure(meta, outdir, abs(entryOut)),
  };
}
