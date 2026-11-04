/**
 * Splits a production bundle by output format (R-ASCII-9, D76, D87): the files an SVG render can
 * load, and the files only `format: 'ascii'` loads. One diagram type's text path has its own soft
 * 15 KB gzip budget (`LIMITS.asciiGzipBytes`) and must never be reachable from the SVG path, so
 * R-PERF-1 is not charged for it.
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

/** The diagram a diagram-package ascii entry belongs to (`diagram-sequence` → `sequence`). */
function diagramOf(entryPoint: string): string | undefined {
  return /packages\/diagram-([^/]+)\/src\/ascii\.ts$/.exec(entryPoint)?.[1];
}

/**
 * What one text render of each diagram type loads on top of its SVG render: the ascii-only
 * files reachable from mermaid's own ascii entry and that diagram's ascii entry (`core/ascii`,
 * the shared text kit, plus the diagram's drawing), by diagram, sorted by name.
 */
export function asciiPaths(bundle: Bundle): { diagram: string; size: SizeSummary }[] {
  const { ascii } = splitByFormat(bundle);
  const entries = ascii.filter((f) => bundle.graph[f]?.entryPoint !== undefined);
  const shared = entries.filter((f) => diagramOf(bundle.graph[f]!.entryPoint!) === undefined);
  const out: { diagram: string; size: SizeSummary }[] = [];
  for (const f of entries) {
    const diagram = diagramOf(bundle.graph[f]!.entryPoint!);
    if (diagram === undefined) continue;
    const files = closure(bundle, [...shared, f], () => true).filter((x) => ascii.includes(x));
    out.push({
      diagram,
      size: summarise(
        bundle.files.filter((x) => files.includes(x.path)),
        'static'
      ),
    });
  }
  return out.sort((a, b) => Number(a.diagram > b.diagram) - Number(a.diagram < b.diagram));
}

/**
 * Gzip size of the largest one-diagram text path (`asciiPaths`), measured from the build
 * (`source: 'static'`): a page renders one diagram type as text, so the soft budget (D87) holds
 * per type, not for every type's drawing at once.
 */
export function asciiSize(bundle: Bundle): SizeSummary {
  const paths = asciiPaths(bundle);
  if (paths.length === 0) return summarise([], 'static');
  return paths.reduce((a, b) => (b.size.gzip > a.size.gzip ? b : a)).size;
}
