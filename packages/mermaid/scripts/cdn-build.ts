/**
 * The CDN build (D162, D163; spec #218 T6), run by `mermaid`'s `build` script after `tsc`:
 *
 * - `dist/mermaid.esm.min.mjs`: `src/cdn.ts` as minified ESM. Every module `mermaid` imports
 *   lazily (each diagram package, its `ascii` entry, the text backend, the theme specs) is its
 *   own file under `dist/chunks/` with a stable name (`diagram-flowchart.mjs`,
 *   `core-theme-specs-dark.mjs`); code they share is split into hashed `chunks/chunk-*.mjs`.
 *   Each diagram's `language` entry is built there too, for editors loading from a CDN.
 * - `dist/mermaid.min.js`: `src/cdn-loader.ts` as a classic script, with no imports.
 *
 * Lazy imports load against `cdnBase` (R-PLUG-7): before bundling, every `import('…')` in the
 * sources is rewritten to `import(globalThis[Symbol.for("mermaid.cdnBase")] + "chunks/<name>.mjs")`.
 * `cdn.ts` sets that base (by default, the directory of the ESM file) and `initialize({ cdnBase })`
 * changes it. A lazy import the build cannot name fails the build, so nothing loads relative to
 * a URL the integrator did not choose.
 *
 * Source maps sit beside each file with their sources embedded; source paths read
 * `node_modules/<package>/<path>` so tools (and the platform e2e) can tell the packages apart.
 *
 * Node only: a build tool outside `src`, never part of the published modules.
 */
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, type BuildOptions, type Metafile, type Plugin } from 'esbuild';

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES_DIR = resolve(PACKAGE_DIR, '..');
const REPO_DIR = resolve(PACKAGES_DIR, '..');

export const ESM_FILE = 'mermaid.esm.min.mjs';
export const LOADER_FILE = 'mermaid.min.js';
/** The global the rewritten lazy imports read; `cdn.ts` sets it. */
const BASE = 'globalThis[Symbol.for("mermaid.cdnBase")]';

/** A lazy import's dynamic `import('…')` in source text (single or double quotes). */
const DYNAMIC_IMPORT = /\bimport\((['"])([^'"]+)\1\)/g;

export interface CdnFile {
  /** Path relative to the output directory, `/`-separated. */
  readonly path: string;
  readonly gzip: number;
  /** Files it imports statically, relative to the output directory. */
  readonly imports: readonly string[];
  /** Files it imports lazily through a relative URL (the build fails on any). */
  readonly lazy: readonly string[];
  /** Source module (repo-relative) of an entry: the ESM entry, the loader or a named chunk. */
  readonly entryPoint?: string;
}

export interface CdnBuild {
  readonly outdir: string;
  readonly files: readonly CdnFile[];
  /** gzip-9 bytes of the ESM entry and every file it imports statically. */
  readonly esmClosureGzip: number;
  /** gzip-9 bytes of `mermaid.min.js`. */
  readonly loaderGzip: number;
}

const toPosix = (p: string): string => p.split(sep).join('/');

/** Which workspace package a real path belongs to: `{ name, dir }`, by its package.json. */
function packageOf(file: string): { name: string; dir: string } | undefined {
  const rel = relative(PACKAGES_DIR, file);
  if (rel.startsWith('..')) return undefined;
  const dir = join(PACKAGES_DIR, rel.split(sep)[0]!);
  const { name } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string };
  return { name, dir };
}

/** The stable chunk name of a lazily imported source module: `<package dir>-<path in src>`. */
function chunkName(file: string): string {
  const pkg = packageOf(file);
  if (!pkg) throw new Error(`cdn build: lazy import outside the workspace packages: ${file}`);
  const inSrc = toPosix(relative(join(pkg.dir, 'src'), file)).replace(/\.[cm]?[jt]s$/, '');
  const short = pkg.dir.slice(PACKAGES_DIR.length + 1);
  return `chunks/${inSrc === 'index' ? short : `${short}-${inSrc.replaceAll('/', '-')}`}`;
}

/** The `language` entries of the first-party diagram packages `mermaid` depends on. */
function languageEntries(): string[] {
  const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
  };
  const out: string[] = [];
  for (const dep of Object.keys(manifest.dependencies)) {
    if (!dep.startsWith('@mermaid-js/diagram-')) continue;
    const dir = realpathSync(join(PACKAGE_DIR, 'node_modules', dep));
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      exports: Record<string, Record<string, string> | undefined>;
    };
    const source = pkg.exports['./language']?.['mermaid-source'];
    if (source) out.push(join(dir, source));
  }
  return out;
}

const COMMON: BuildOptions = {
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  minify: true,
  metafile: true,
  write: false,
  logLevel: 'silent',
  absWorkingDir: PACKAGES_DIR,
  // Workspace packages bundle from their TypeScript sources, as the bench and tests do.
  conditions: ['mermaid-source'],
  define: { __MERMAID_BENCH__: 'false' },
  legalComments: 'none',
};

/** Pass 1: the source modules `src/cdn.ts` imports lazily, found by a plain split build. */
async function lazyTargets(outdir: string): Promise<{ targets: string[]; importers: Set<string> }> {
  const result = await build({
    ...COMMON,
    entryPoints: [join(PACKAGE_DIR, 'src/cdn.ts')],
    outdir,
    format: 'esm',
    splitting: true,
  });
  const targets = new Set<string>();
  const importers = new Set<string>();
  for (const [input, info] of Object.entries(result.metafile!.inputs)) {
    for (const imp of info.imports) {
      if (imp.kind !== 'dynamic-import') continue;
      importers.add(realpathSync(resolve(PACKAGES_DIR, input)));
      targets.add(realpathSync(resolve(PACKAGES_DIR, imp.path)));
    }
  }
  return { targets: [...targets], importers };
}

/** Rewrites each lazy import in `importers` to load `chunks/<name>.mjs` from `cdnBase`. */
function cdnImports(importers: ReadonlySet<string>, names: ReadonlyMap<string, string>): Plugin {
  return {
    name: 'mermaid-cdn-imports',
    setup(b) {
      b.onLoad({ filter: /\.[cm]?[jt]s$/ }, async (args) => {
        const file = realpathSync(args.path);
        if (!importers.has(file)) return undefined;
        const source = readFileSync(file, 'utf8');
        const urls = new Map<string, string>();
        for (const [, , spec] of source.matchAll(DYNAMIC_IMPORT)) {
          if (urls.has(spec!)) continue;
          const r = await b.resolve(spec!, { kind: 'dynamic-import', resolveDir: dirname(file) });
          const name = r.path ? names.get(realpathSync(r.path)) : undefined;
          if (!name) throw new Error(`cdn build: cannot name the lazy import "${spec}" in ${file}`);
          urls.set(spec!, `${name}.mjs`);
        }
        const contents = source.replace(
          DYNAMIC_IMPORT,
          (_m, _q, spec: string) => `import(${BASE} + ${JSON.stringify(urls.get(spec))})`
        );
        return { contents, loader: file.endsWith('.ts') ? 'ts' : 'js', resolveDir: dirname(file) };
      });
    },
  };
}

/** `sources` as `node_modules/<package>/<path>`, resolved from the map's own location. */
function packageSources(mapFile: string, map: { sources: string[] }): void {
  map.sources = map.sources.map((s) => {
    const abs = resolve(dirname(mapFile), s);
    const pkg = packageOf(abs);
    return pkg ? `node_modules/${pkg.name}/${toPosix(relative(pkg.dir, abs))}` : s;
  });
}

function filesOf(meta: Metafile, outdir: string, written: Map<string, Buffer>): CdnFile[] {
  const rel = (p: string): string => toPosix(relative(outdir, resolve(PACKAGES_DIR, p)));
  return Object.entries(meta.outputs)
    .filter(([p]) => !p.endsWith('.map'))
    .map(([p, o]) => ({
      path: rel(p),
      gzip: gzipSync(written.get(rel(p))!, { level: 9 }).length,
      imports: o.imports.filter((i) => i.kind === 'import-statement').map((i) => rel(i.path)),
      lazy: o.imports
        .filter((i) => i.kind === 'dynamic-import' && !i.external)
        .map((i) => rel(i.path)),
      ...(o.entryPoint !== undefined && {
        entryPoint: toPosix(relative(REPO_DIR, resolve(PACKAGES_DIR, o.entryPoint))),
      }),
    }));
}

/** Total gzip bytes of `root` and the files it imports statically. */
export function closureGzip(files: readonly CdnFile[], root: string): number {
  const seen = new Set<string>();
  const visit = (path: string): void => {
    if (seen.has(path)) return;
    seen.add(path);
    for (const i of files.find((f) => f.path === path)?.imports ?? []) visit(i);
  };
  visit(root);
  return [...seen].reduce((n, p) => n + (files.find((f) => f.path === p)?.gzip ?? 0), 0);
}

/** Builds both CDN files into `outdir` (default `dist`), replacing an earlier CDN build there. */
export async function buildCdn(outdir: string = join(PACKAGE_DIR, 'dist')): Promise<CdnBuild> {
  const { targets, importers } = await lazyTargets(outdir);
  const names = new Map(targets.map((t) => [t, chunkName(t)]));
  for (const lang of languageEntries()) names.set(lang, chunkName(lang));
  const esm = await build({
    ...COMMON,
    entryPoints: [
      { in: join(PACKAGE_DIR, 'src/cdn.ts'), out: ESM_FILE.replace(/\.mjs$/, '') },
      ...[...names].map(([file, out]) => ({ in: file, out })),
    ],
    outdir,
    format: 'esm',
    splitting: true,
    sourcemap: 'linked',
    sourcesContent: true,
    outExtension: { '.js': '.mjs' },
    chunkNames: 'chunks/[name]-[hash]',
    plugins: [cdnImports(importers, names)],
  });
  const loader = await build({
    ...COMMON,
    entryPoints: [join(PACKAGE_DIR, 'src/cdn-loader.ts')],
    outfile: join(outdir, LOADER_FILE),
    format: 'iife',
    sourcemap: 'linked',
    sourcesContent: true,
  });

  rmSync(join(outdir, 'chunks'), { recursive: true, force: true });
  const written = new Map<string, Buffer>();
  for (const f of [...esm.outputFiles!, ...loader.outputFiles!]) {
    let bytes = Buffer.from(f.contents);
    if (f.path.endsWith('.map')) {
      const map = JSON.parse(bytes.toString('utf8')) as { sources: string[] };
      packageSources(f.path, map);
      bytes = Buffer.from(JSON.stringify(map));
    }
    mkdirSync(dirname(f.path), { recursive: true });
    writeFileSync(f.path, bytes);
    written.set(toPosix(relative(outdir, f.path)), bytes);
  }
  const files = [
    ...filesOf(esm.metafile!, outdir, written),
    ...filesOf(loader.metafile!, outdir, written),
  ];
  // A relative lazy import would load from the ESM file's directory, not from `cdnBase`.
  const relative_ = files.filter((f) => f.lazy.length > 0).map((f) => f.path);
  if (relative_.length > 0)
    throw new Error(`cdn build: relative lazy imports left in ${relative_.join(', ')}`);
  return {
    outdir,
    files,
    esmClosureGzip: closureGzip(files, ESM_FILE),
    loaderGzip: files.find((f) => f.path === LOADER_FILE)!.gzip,
  };
}

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = await buildCdn(process.argv[2] ? resolve(process.argv[2]) : undefined);
  console.log(
    `CDN build: ${ESM_FILE} with its static imports ${kb(out.esmClosureGzip)} gz, ` +
      `${LOADER_FILE} ${kb(out.loaderGzip)} gz, ${out.files.length} files`
  );
}
