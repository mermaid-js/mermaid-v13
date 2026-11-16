/** Markdown of the size report (#814): lines by category and package, gzip bytes per diagram. */
import type { CategoryId } from './code-categories.ts';
import { CATEGORIES } from './code-categories.ts';
import type { ChunkSizes, CodeSizeReport, LineCounts, PeleChunks } from './code-size.ts';
import { UNCLASSIFIED } from './code-size.ts';
import { dash, row, rule } from './md.ts';

/** Spec #813's table order; `tooling` and unmatched files last. */
const ORDER: readonly string[] = [
  'parsing',
  'render',
  'editor',
  'test',
  'generated',
  'swimlane',
  'api',
  'shared-layout',
  'ascii',
  'theme-config',
  'plugins',
  'tooling',
  UNCLASSIFIED,
] satisfies readonly (CategoryId | typeof UNCLASSIFIED)[];

const n = (v: number) => v.toLocaleString('en-US');
const label = (id: string) =>
  CATEGORIES.find((c) => c.id === id)?.label ?? 'Matched by no category';
const present = (byCategory: Record<string, number>) =>
  ORDER.filter((id) => (byCategory[id] ?? 0) > 0);

function categoryLines(lines: LineCounts): string[] {
  const out = [row(['Category', 'Lines', 'Share']), rule(3)];
  for (const id of present(lines.byCategory)) {
    const v = lines.byCategory[id]!;
    const share = id === 'tooling' ? '' : `${((v / lines.total) * 100).toFixed(1)}%`;
    if (id === 'tooling')
      out.push(row(['**Published packages**', `**${n(lines.total)}**`, '100%']));
    out.push(row([label(id), n(v), share]));
  }
  if (!('tooling' in lines.byCategory))
    out.push(row(['**Published packages**', `**${n(lines.total)}**`, '100%']));
  return out;
}

function packageLines(lines: LineCounts): string[] {
  const cols = present(lines.byCategory);
  return [
    row(['Package', 'Total', ...cols]),
    rule(cols.length + 2),
    ...lines.packages.map((p) =>
      row([p.pkg, n(p.total), ...cols.map((c) => (p.byCategory[c] ? n(p.byCategory[c]) : dash))])
    ),
  ];
}

/** Pele's name for a v13 diagram package (`diagram-gitgraph` → `gitGraph`), if it has one. */
const peleName = (pkg: string, pele: PeleChunks) => {
  const type = pkg.replace(/^diagram-/, '');
  return pele.diagrams.find((d) => [type, `${type}chart`].includes(d.diagram.toLowerCase()));
};

/** One row per v13 diagram package, then the Pele entries no package matched. */
function diagramRows(chunks: ChunkSizes, pele: PeleChunks): string[] {
  const matched = new Set<string>();
  const out = chunks.diagrams.map((d) => {
    const p = peleName(d.pkg, pele);
    if (p) matched.add(p.diagram);
    return row([d.pkg.replace(/^diagram-/, ''), n(d.chunk), n(d.closure), p ? n(p.closure) : dash]);
  });
  for (const p of pele.diagrams.filter((x) => !matched.has(x.diagram)))
    out.push(row([`${p.diagram} (Pele only)`, dash, dash, n(p.closure)]));
  return out;
}

function byteLines(chunks: ChunkSizes, pele: PeleChunks): string[] {
  const peleFlowchart = pele.diagrams.find((d) => d.diagram === 'flowchart')?.closure;
  return [
    row(['Diagram', 'v13 chunk', 'v13 beyond core', `Pele ${pele.version} beyond core`]),
    rule(4),
    row(['core', n(chunks.core), '', n(pele.core)]),
    row([
      'core + flowchart (loaded)',
      n(chunks.loaded),
      '',
      peleFlowchart === undefined ? dash : n(pele.core + peleFlowchart),
    ]),
    ...diagramRows(chunks, pele),
    row([
      'all files',
      `${n(chunks.total)} (${chunks.files} files)`,
      '',
      `${n(pele.total)} (${pele.files} files)`,
    ]),
  ];
}

/** The size report as markdown lines, under a `##` heading. */
export function codeSizeLines(report: CodeSizeReport): string[] {
  const { lines } = report;
  const out = [
    '## Code size',
    '',
    'Lines are non-blank, non-comment lines of the non-spec `.ts` files under `packages/*/src` (spec #813). The published total leaves out the private packages.',
    '',
    ...categoryLines(lines),
    '',
  ];
  if (lines.unclassified.length > 0)
    out.push(
      `Matched by no category: ${lines.unclassified.map((p) => `\`${p}\``).join(', ')}.`,
      ''
    );
  out.push('### Lines by package', '', ...packageLines(lines), '');
  if (report.chunks && report.pele) {
    out.push(
      '### Gzip bytes per diagram',
      '',
      'Gzip-9 bytes of the production build of the core entry, each file gzipped on its own. "Beyond core" is what an SVG render of the type loads after core: its chunk and the chunks that chunk imports statically. Pele is its published `dist/esm` build.',
      '',
      ...byteLines(report.chunks, report.pele),
      ''
    );
  }
  return out;
}
