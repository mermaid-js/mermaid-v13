/**
 * Splits a production bundle by output format (R-ASCII-9, D76, D87): the files an SVG render can
 * load, and the files only `format: 'ascii'` loads. The ascii share has its own soft 15 KB gzip budget
 * (`LIMITS.asciiGzipBytes`) and must never be reachable from the SVG path, so R-PERF-1 is not
 * charged for it.
 */
import type { Bundle } from './build.ts';
import { summarise } from './build.ts';
import type { SizeSummary } from './report.ts';

/**
 * A source module of the text backend: `core/src/ascii/`, a diagram's `src/ascii.ts` or
 * `src/ascii/`, and the mermaid package's `src/ascii.ts`. The same `ascii`-named paths the
 * `mermaid/import-boundaries` lint rule lets import `@mermaid-js/core/ascii`.
 */
export function isAsciiModule(input: string): boolean {
  return /(^|\/)packages\/[^/]+\/src\/ascii(\.ts|\/)/.test(input);
}

function closure(bundle: Bundle, roots: string[], follow: (target: string) => boolean): string[] {
  const seen: string[] = [];
  const visit = (file: string) => {
    if (seen.includes(file)) return;
    seen.push(file);
    for (const imp of bundle.graph[file]?.imports ?? []) {
      if (imp.kind === 'static' || follow(imp.path)) visit(imp.path);
    }
  };
  for (const r of roots) visit(r);
  return seen;
}

export interface FormatSplit {
  /** Every file an SVG render can load: the entry and its imports, lazy ones included, except ascii entries. */
  svg: string[];
  /** Files reachable only through an ascii entry: what a text render adds. */
  ascii: string[];
}

export function splitByFormat(bundle: Bundle): FormatSplit {
  const asciiEntry = (file: string) => {
    const ep = bundle.graph[file]?.entryPoint;
    return ep !== undefined && isAsciiModule(ep);
  };
  const svg = closure(bundle, [bundle.entryFile], (t) => !asciiEntry(t));
  const roots = Object.keys(bundle.graph).filter(asciiEntry);
  const ascii = closure(bundle, roots, () => true).filter((f) => !svg.includes(f));
  return { svg, ascii };
}

/** Gzip size of the ascii-only files, measured from the build (`source: 'static'`). */
export function asciiSize(bundle: Bundle): SizeSummary {
  const { ascii } = splitByFormat(bundle);
  return summarise(
    bundle.files.filter((f) => ascii.includes(f.path)),
    'static'
  );
}
