/** Markdown of the size report (#814): lines by category and package, gzip bytes per diagram. */
import type { CategoryId } from './code-categories.ts';
import { CATEGORIES } from './code-categories.ts';
import type { ChunkSizes, CodeSizeReport, LineCounts, PeleChunks } from './code-size.ts';
import { UNCLASSIFIED } from './code-size.ts';
import { dash, row, rule } from './md.ts';

/**
 * Spec #813's table order, then unmatched files (counted in the published total) and `tooling`
 * (left out of it).
 */
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
  UNCLASSIFIED,
  'tooling',
] satisfies readonly (CategoryId | typeof UNCLASSIFIED)[];

const n = (v: number) => v.toLocaleString('en-US');
const category = (id: string) => CATEGORIES.find((c) => c.id === id);
const label = (id: string) => category(id)?.label ?? 'Matched by no category';
const short = (id: string) => category(id)?.short ?? 'Unclassified';
const present = (byCategory: Record<string, number>) =>
  ORDER.filter((id) => (byCategory[id] ?? 0) > 0);

function categoryLines(lines: LineCounts): string[] {
  const published = present(lines.byCategory).filter((id) => id !== 'tooling');
  const share = (v: number) => `${((v / lines.total) * 100).toFixed(1)}%`;
  const tooling = lines.byCategory.tooling ?? 0;
  return [
    row(['Category', 'Lines', 'Share']),
    rule(3),
    ...published.map((id) => {
      const v = lines.byCategory[id]!;
      return row([label(id), n(v), share(v)]);
    }),
    row(['**Published packages**', `**${n(lines.total)}**`, '100%']),
    ...(tooling > 0 ? [row([label('tooling'), n(tooling), ''])] : []),
  ];
}

function packageLines(lines: LineCounts): string[] {
  const cols = present(lines.byCategory);
  return [
    row(['Package', 'Total', ...cols.map(short)]),
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
    return row([
      d.pkg.replace(/^diagram-/, ''),
      n(d.chunk),
      n(d.closure),
      d.layout ? `${d.layout.engine} ${n(d.layout.bytes)}` : dash,
      n(d.closure + (d.layout?.bytes ?? 0)),
      p ? n(p.closure) : dash,
    ]);
  });
  for (const p of pele.diagrams.filter((x) => !matched.has(x.diagram)))
    out.push(row([`${p.diagram} (Pele only)`, dash, dash, dash, dash, n(p.closure)]));
  return out;
}

/** A row with a first cell, a v13 figure, three empty v13 columns and a Pele figure. */
const summaryRow = (name: string, v13: string, peleCell: string) =>
  row([name, v13, '', '', '', peleCell]);

function byteLines(chunks: ChunkSizes, pele: PeleChunks): string[] {
  const peleFlowchart = pele.diagrams.find((d) => d.diagram === 'flowchart')?.closure;
  return [
    row([
      'Diagram',
      'v13 chunk',
      'v13 static closure',
      'v13 default layout',
      'v13 render',
      `Pele ${pele.version}`,
    ]),
    rule(6),
    summaryRow('core', n(chunks.core), n(pele.core)),
    summaryRow(
      'core + flowchart (loaded)',
      n(chunks.loaded),
      peleFlowchart === undefined ? dash : n(pele.core + peleFlowchart)
    ),
    ...diagramRows(chunks, pele),
    summaryRow(
      'all files',
      `${n(chunks.total)} (${chunks.files} files)`,
      `${n(pele.total)} (${pele.files} files)`
    ),
  ];
}

const BYTES_NOTE = [
  'Gzip-9 bytes of the production build of the core entry, each file gzipped on its own.',
  'Below the two core rows, every figure is what a type loads beyond core.',
  '"Static closure" is the chunk and the chunks it imports statically.',
  '"Default layout" is the lazy chunk of the engine the plugin names as `layoutEngine.default`, which the registry loads for every render of the type; "render" is the sum of the two.',
  'Pele is its published `dist/esm` build: each `diagrams/<name>.js` entry and its static imports beyond `core.js`, layouts included.',
].join(' ');

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
      BYTES_NOTE,
      '',
      ...byteLines(report.chunks, report.pele),
      ''
    );
  }
  return out;
}
