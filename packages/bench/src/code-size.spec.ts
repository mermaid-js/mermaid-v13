/** The line half of the size report (#814): lines per package and category of a checkout. */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ChunkSizes } from './code-size.ts';
import { diagramChunks, measureLines, peleChunks } from './code-size.ts';
import type { ClosureSize } from './size-budget.ts';
import { flowchartClosureSize, measureStaticClosure, readSizeBudget } from './size-budget.ts';

function checkout(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mermaid-lines-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe('measureLines', () => {
  const root = checkout({
    'packages/diagram-pie/src/parser/lexer.ts':
      '// lexer\nexport const a = 1;\n\nexport const b = 2;\n',
    'packages/diagram-pie/src/parser/lexer.spec.ts': 'export const skipped = 1;\n',
    'packages/diagram-pie/src/render/render.ts': 'export const r = 1;\n',
    'packages/diagram-pie/src/v12-specs/pie.ts': 'export const v = 1;\n',
    'packages/diagram-pie/README.md': '# not counted\n',
    'packages/bench/src/build.ts': 'export const x = 1;\nexport const y = 2;\n',
    'packages/core/src/unclassified/thing.ts': 'export const u = 1;\n',
  });
  const lines = measureLines(root);

  it('counts lines per package and category, without specs', () => {
    expect(lines.packages).toEqual([
      { pkg: 'bench', total: 2, byCategory: { tooling: 2 } },
      { pkg: 'core', total: 1, byCategory: { unclassified: 1 } },
      { pkg: 'diagram-pie', total: 4, byCategory: { parsing: 2, render: 1, test: 1 } },
    ]);
  });

  it('totals by category, and leaves the private tooling out of the published total', () => {
    expect(lines.byCategory).toEqual({
      tooling: 2,
      unclassified: 1,
      parsing: 2,
      render: 1,
      test: 1,
    });
    expect(lines.total).toBe(5);
  });

  it('names the files no category matches', () => {
    expect(lines.unclassified).toEqual(['packages/core/src/unclassified/thing.ts']);
  });
});

describe('diagramChunks (v13 production build)', () => {
  let core: ClosureSize;
  let chunks: ChunkSizes;
  beforeAll(async () => {
    core = await measureStaticClosure(readSizeBudget().core.entry);
    chunks = diagramChunks(core.bundle);
  }, 60_000);

  it('reports the core and loaded figures the size gates check', () => {
    expect(chunks.core).toBe(core.size.gzip);
    expect(chunks.loaded).toBe(flowchartClosureSize(core.bundle).gzip);
  });

  it('sizes the chunk of every diagram package, and what its render loads beyond core', () => {
    const names = chunks.diagrams.map((d) => d.pkg);
    expect(names).toContain('diagram-flowchart');
    expect(names).toContain('diagram-pie');
    expect(names).toEqual([...names].sort());
    for (const d of chunks.diagrams) {
      expect(d.chunk).toBeGreaterThan(0);
      expect(d.closure).toBeGreaterThanOrEqual(d.chunk);
    }
    const flowchart = chunks.diagrams.find((d) => d.pkg === 'diagram-flowchart')!;
    expect(chunks.core + flowchart.closure).toBe(chunks.loaded);
  });

  it('totals every output file once, core included', () => {
    expect(chunks.files).toBe(core.bundle.files.length);
    expect(chunks.total).toBe(core.bundle.files.reduce((a, f) => a + f.gzip, 0));
  });
});

describe('peleChunks (the published build the bench depends on)', () => {
  const pele = peleChunks();

  it('sizes Pele core and each diagram entry beyond core, chunks gzipped one by one', () => {
    expect(pele.core).toBeGreaterThan(0);
    const flowchart = pele.diagrams.find((d) => d.diagram === 'flowchart');
    expect(flowchart?.closure).toBeGreaterThan(0);
    expect(pele.diagrams.length).toBeGreaterThan(20);
    expect(pele.total).toBeGreaterThan(flowchart!.closure);
  });

  // Spec #813 measured Pele 1.13.0 in decimal kilobytes: 19.2 KB gz for core and 313 KB over
  // all 122 files.
  it.runIf(pele.version === '1.13.0')('gives the figures spec #813 measured on 1.13.0', () => {
    expect(Math.round(pele.core / 100) / 10).toBe(19.2);
    expect(Math.round(pele.total / 1000)).toBe(313);
    expect(pele.files).toBe(122);
  });
});
