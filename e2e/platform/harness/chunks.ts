/**
 * What a built app's pages load (R-PLUG-4, spec #218 T3): Playwright records every script
 * request, and each served file is mapped, through its source map, to the parts of the
 * installed packages it holds. Shared by the bundle specs of every bundler (T3, T5).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import type { Page } from '@playwright/test';
import { REPO_ROOT } from './pack.ts';

/**
 * A part of the installed code: `app` (the app's own modules and the bundler's runtime),
 * `core` (`mermaid` and `@mermaid-js/core` without their text entries), `diagram:<id>`
 * (`@mermaid-js/diagram-<id>`'s SVG entry), `ascii` (any text entry), `language` (any language
 * entry or language-service package), `testing`, or `package:<name>` for anything else.
 */
export type ChunkPart = string;

const NODE_MODULES = /(?:^|[/\\])node_modules[/\\]/g;

/** `export {…} from '…'`, `export * from '…'` and `import '…'`, the statements of a facade. */
const FACADE_STATEMENT =
  /(?:export\s*(?:\*|\{[^}]*\})\s*from\s*|import\s*)(?:"[^"]*"|'[^']*')\s*;?|\/\/[^\n]*/g;

/** The installed package a source-map source path is in, and the file's path inside it. */
function packageFile(source: string): { name: string; file: string } | undefined {
  const at = [...source.matchAll(NODE_MODULES)].at(-1);
  if (at === undefined) return undefined;
  const rest = source.slice(at.index + at[0].length).split(/[/\\]/);
  const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
  return { name, file: rest.slice(name.split('/').length).join('/') };
}

/** The part of one source-map source path. */
export function partOf(source: string): ChunkPart {
  const at = packageFile(source);
  if (at === undefined) return 'app';
  const { name, file } = at;
  if (/(?:^|\/)ascii(?:[./]|$)/.test(file)) return 'ascii';
  if (/(?:^|\/)language(?:[./]|$)/.test(file) || name.startsWith('@mermaid-js/language-'))
    return 'language';
  if (/(?:^|\/)testing(?:[./]|$)/.test(file)) return 'testing';
  if (name === 'mermaid' || name === '@mermaid-js/core') return 'core';
  const diagram = /^@mermaid-js\/diagram-(.+)$/.exec(name);
  return diagram ? `diagram:${diagram[1]}` : `package:${name}`;
}

/** The parts in the built file at `path` (as served from `dist`), read from its source map. */
export function chunkParts(dist: string, path: string): Set<ChunkPart> {
  return new Set(chunkSources(dist, path).map(partOf));
}

/**
 * The source paths in the built file at `path` (as served from `dist`), as its source map
 * lists them: finer than `chunkParts`, e.g. to tell a plugin's detector from its entry.
 */
export function chunkSources(dist: string, path: string): string[] {
  const file = join(dist, path);
  const code = readFileSync(file, 'utf8');
  const comment = /[#@] sourceMappingURL=([^\s'"]+)\s*$/.exec(code)?.[1];
  const mapFile =
    comment !== undefined && !comment.startsWith('data:')
      ? join(dirname(file), decodeURIComponent(comment))
      : `${file}.map`;
  if (!existsSync(mapFile)) {
    // Rolldown (Vite) writes no map for a facade chunk: re-exports of other chunks, which
    // the browser requests (and the recorder records) on their own.
    if (code.replace(FACADE_STATEMENT, '').trim() === '') return [];
    throw new Error(`${path} has no source map: build the app with source maps on`);
  }
  const map = JSON.parse(readFileSync(mapFile, 'utf8')) as { sources: string[] };
  return map.sources;
}

export interface ScriptRecorder {
  /** Every script path requested from `origin` so far, in order. */
  readonly all: readonly string[];
  /** The script paths requested since the last call (or since recording began). */
  next(): string[];
}

/** Records the path of every script request `page` makes to `origin`, from now on. */
export function recordScripts(page: Page, origin: string): ScriptRecorder {
  const all: string[] = [];
  let seen = 0;
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.origin !== origin) return;
    if (req.resourceType() === 'script' || url.pathname.endsWith('.js')) all.push(url.pathname);
  });
  return {
    all,
    next: () => {
      const out = all.slice(seen);
      seen = all.length;
      return out;
    },
  };
}

export interface LoadedExpectation {
  /** Diagram ids whose chunks may load (`flowchart`, `class`, …). */
  readonly diagrams: readonly string[];
  /** Diagram ids whose chunks must be among the scripts. Default none. */
  readonly required?: readonly string[];
}

const SHARED = '@mermaid-js/shared';

/**
 * A module's name inside its package: its path without `src/` or `dist/` and without the
 * extension, so the TypeScript source (in the CDN build's maps) and the built file (in a
 * bundler's maps) have the same one: `parser/flow-lexer`.
 */
const moduleName = (file: string): string =>
  file.replace(/^(?:src|dist)\//, '').replace(/\.[cm]?[jt]s$/, '');

/** The module specifiers of every `import`/`export … from` and `import()` that loads code. */
function specifiers(code: string): string[] {
  // Only comments that start a line: a `/*` inside a line comment or after code
  // (`shared/shapes/*`) opens no block.
  const text = code.replace(/^\s*\/\/.*$/gm, '').replace(/^\s*\/\*[\s\S]*?\*\//gm, '');
  // `import type` and `export type` load nothing; `import { type A, b }` does.
  const statics = text.matchAll(
    /\b(?:import|export)\s+(?!type\s)(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/g
  );
  const dynamics = text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g);
  return [...statics, ...dynamics].map((m) => m[1]);
}

/** The source file of a workspace package's export, e.g. `('@mermaid-js/shared', './layout')`. */
function exportSource(name: string, subpath: string): string {
  const dir = join(REPO_ROOT, 'packages', name.replace(/^@mermaid-js\//, ''));
  const exports = (
    JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      exports: Partial<Record<string, { 'mermaid-source'?: string }>>;
    }
  ).exports;
  const source = exports[subpath]?.['mermaid-source'];
  if (source === undefined) throw new Error(`${name} has no export ${subpath}`);
  return join(dir, source);
}

/** The TypeScript file a relative specifier in `from` names, if it is one. */
function resolveRelative(from: string, specifier: string): string | undefined {
  const base = join(dirname(from), specifier);
  return [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, join(base, 'index.ts')].find(
    (f) => f.endsWith('.ts') && existsSync(f)
  );
}

/**
 * The `@mermaid-js/shared` modules that the SVG entries of `diagrams` reach through their
 * imports, static and dynamic, as `moduleName`s. Read from the workspace sources the installed
 * tarballs were packed from. Since D559 a diagram's own parser, shapes and drawing can live in
 * shared, and a page that renders it loads them; a shared module no allowed diagram reaches
 * must not load.
 */
function sharedReach(diagrams: readonly string[]): Set<string> {
  const sharedDir = join(REPO_ROOT, 'packages', 'shared');
  const reached = new Set<string>();
  const seen = new Set<string>();
  const queue = diagrams.map((d) => exportSource(`@mermaid-js/diagram-${d}`, '.'));
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.startsWith(sharedDir + sep)) reached.add(moduleName(relative(sharedDir, file)));
    for (const s of specifiers(readFileSync(file, 'utf8'))) {
      if (s.startsWith('.')) {
        const target = resolveRelative(file, s);
        if (target !== undefined) queue.push(target);
      } else if (s.startsWith(`${SHARED}/`)) {
        queue.push(exportSource(SHARED, `./${s.slice(SHARED.length + 1)}`));
      }
    }
  }
  return reached;
}

/**
 * The parts of the built file at `path`, as `chunkParts` gives them, except that a module of
 * `@mermaid-js/shared` is `shared` when it is in `reach` and `shared:<module>` when not.
 */
function partsWithShared(dist: string, path: string, reach: ReadonlySet<string>): Set<ChunkPart> {
  return new Set(
    chunkSources(dist, path).map((source) => {
      const part = partOf(source);
      if (part !== `package:${SHARED}`) return part;
      const name = moduleName(packageFile(source)!.file);
      return reach.has(name) ? 'shared' : `shared:${name}`;
    })
  );
}

/**
 * Throws unless the scripts at `paths` hold only `app`, `core`, the chunks of the allowed
 * diagram types and the `@mermaid-js/shared` modules those types import (D559), and hold the
 * required ones. No `ascii`, `language`, `testing` or other package code may load, nor a shared
 * module that only other types import (`shared:<module>`). The message lists each script with
 * its parts.
 */
export function assertLoadedOnly(
  dist: string,
  paths: readonly string[],
  expected: LoadedExpectation
): void {
  const allowed = new Set(['app', 'core', ...expected.diagrams.map((d) => `diagram:${d}`)]);
  const reach = sharedReach(expected.diagrams);
  if (reach.size > 0) allowed.add('shared');
  const parts = new Map(paths.map((p) => [p, partsWithShared(dist, p, reach)]));
  const loaded = new Set([...parts.values()].flatMap((s) => [...s]));
  const extra = [...loaded].filter((p) => !allowed.has(p));
  const missing = (expected.required ?? []).filter((d) => !loaded.has(`diagram:${d}`));
  if (extra.length === 0 && missing.length === 0) return;
  const listing = [...parts].map(([p, s]) => `  ${p}: ${[...s].sort().join(', ')}`).join('\n');
  throw new Error(
    [
      extra.length > 0 ? `Loaded parts that should not load: ${extra.sort().join(', ')}` : '',
      missing.length > 0 ? `Diagram chunks that did not load: ${missing.join(', ')}` : '',
      `Scripts loaded (allowed: ${[...allowed].join(', ')}):`,
      listing,
    ]
      .filter(Boolean)
      .join('\n')
  );
}
