/**
 * What a built app's pages load (R-PLUG-4, spec #218 T3): Playwright records every script
 * request, and each served file is mapped, through its source map, to the parts of the
 * installed packages it holds. Shared by the bundle specs of every bundler (T3, T5).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Page } from '@playwright/test';

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

/** The part of one source-map source path. */
export function partOf(source: string): ChunkPart {
  const at = [...source.matchAll(NODE_MODULES)].at(-1);
  if (at === undefined) return 'app';
  const rest = source.slice(at.index + at[0].length).split(/[/\\]/);
  const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
  const file = rest.slice(name.split('/').length).join('/');
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
    if (code.replace(FACADE_STATEMENT, '').trim() === '') return new Set();
    throw new Error(`${path} has no source map: build the app with source maps on`);
  }
  const map = JSON.parse(readFileSync(mapFile, 'utf8')) as { sources: string[] };
  return new Set(map.sources.map(partOf));
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

/**
 * Throws unless the scripts at `paths` hold only `app`, `core` and the chunks of the allowed
 * diagram types, and hold the required ones. No `ascii`, `language`, `testing` or other
 * package code may load. The message lists each script with its parts.
 */
export function assertLoadedOnly(
  dist: string,
  paths: readonly string[],
  expected: LoadedExpectation
): void {
  const allowed = new Set(['app', 'core', ...expected.diagrams.map((d) => `diagram:${d}`)]);
  const parts = new Map(paths.map((p) => [p, chunkParts(dist, p)]));
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
