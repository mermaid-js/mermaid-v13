/**
 * The size report (#814): lines per package and category of a checkout, and gzip bytes per
 * diagram chunk. The equality with the gates' own figures on the real build is checked in
 * `core-size.spec.ts`, which already makes that build.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Bundle } from './build.ts';
import { sizeOf } from './build.ts';
import { defaultLayouts, diagramChunks, measureLines, compareChunks } from './code-size.ts';
import { FLOWCHART_ENTRY } from './size-budget.ts';

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

/**
 * A production build of the core entry, by hand: core is `index.js` and `chunks/core.js`;
 * flowchart and mindmap share `chunks/shared.js`; the tree engine is a lazy chunk with its own
 * static import. Gzip sizes are round numbers so the sums can be read off.
 */
function handBuiltBundle(): Bundle {
  const gzip: Record<string, number> = {
    'index.js': 100,
    'chunks/core.js': 50,
    'chunks/flow.js': 30,
    'chunks/mind.js': 20,
    'chunks/shared.js': 7,
    'chunks/tree.js': 9,
    'chunks/tree-dep.js': 4,
  };
  const s = (path: string) => ({ path, kind: 'static' as const });
  const d = (path: string) => ({ path, kind: 'dynamic' as const });
  return {
    outdir: '/out',
    entryFile: 'index.js',
    files: Object.entries(gzip).map(([path, g]) => ({ path, raw: g * 3, gzip: g, brotli: g })),
    graph: {
      'index.js': {
        entryPoint: 'packages/mermaid/src/cdn.ts',
        imports: [
          s('chunks/core.js'),
          d('chunks/flow.js'),
          d('chunks/mind.js'),
          d('chunks/tree.js'),
        ],
        inputs: [],
      },
      'chunks/core.js': { imports: [], inputs: [] },
      'chunks/flow.js': {
        entryPoint: FLOWCHART_ENTRY,
        imports: [s('chunks/core.js'), s('chunks/shared.js')],
        inputs: [],
      },
      'chunks/mind.js': {
        entryPoint: 'packages/diagram-mindmap/src/index.ts',
        imports: [s('chunks/core.js'), s('chunks/shared.js')],
        inputs: [],
      },
      'chunks/shared.js': { imports: [], inputs: [] },
      'chunks/tree.js': {
        entryPoint: 'packages/core/src/layout/tree/index.ts',
        imports: [s('chunks/core.js'), s('chunks/tree-dep.js')],
        inputs: [],
      },
      'chunks/tree-dep.js': { imports: [], inputs: [] },
    },
  };
}

describe('diagramChunks', () => {
  const chunks = diagramChunks(handBuiltBundle(), { 'diagram-mindmap': 'tree' });

  it('gives core and core + flowchart (loaded) as the size gates measure them', () => {
    expect(chunks.core).toBe(150);
    expect(chunks.loaded).toBe(150 + 30 + 7);
  });

  it('sizes each diagram chunk, its static closure beyond core, and its default layout chunk', () => {
    expect(chunks.diagrams).toEqual([
      { pkg: 'diagram-flowchart', chunk: 30, closure: 37 },
      { pkg: 'diagram-mindmap', chunk: 20, closure: 27, layout: { engine: 'tree', bytes: 13 } },
    ]);
  });

  it('totals every output file once, core included', () => {
    expect(chunks).toMatchObject({ total: 220, files: 7 });
  });

  it('adds no layout for an engine that has no lazy chunk (layered is in core)', () => {
    const plain = diagramChunks(handBuiltBundle(), { 'diagram-flowchart': 'layered' });
    expect(plain.diagrams[0]).toEqual({ pkg: 'diagram-flowchart', chunk: 30, closure: 37 });
  });
});

describe('defaultLayouts', () => {
  // The plugins' own shapes; importing the real packages here would cost seconds of transform.
  const modules: Record<string, Record<string, unknown>> = {
    'diagram-mindmap': { mindmap: { id: 'mindmap', layoutEngine: { default: 'tree' } }, other: 1 },
    'diagram-architecture': { architecture: { layoutEngine: { default: 'compass' } } },
    'diagram-flowchart': { flowchart: { layoutEngine: { default: 'layered' } } },
    'diagram-pie': { pie: { id: 'pie' }, nothing: null },
  };

  it("reads each diagram plugin's default layout engine, leaving out layered", async () => {
    const layouts = await defaultLayouts(Object.keys(modules), (pkg) =>
      Promise.resolve(modules[pkg]!)
    );
    expect(layouts).toEqual({ 'diagram-mindmap': 'tree', 'diagram-architecture': 'compass' });
  });
});

describe('compareChunks', () => {
  it("sizes a compare build's core and each diagram entry beyond core, file by file", () => {
    const dir = checkout({
      'package.json': '{"version":"9.9.9"}',
      'dist/esm/core.js': 'import{a}from"./chunks/A.js";export{a};',
      'dist/esm/lazy.js': 'import"./chunks/A.js";const f=()=>import("./chunks/C.js");',
      'dist/esm/chunks/A.js': 'export const a=1;',
      'dist/esm/chunks/B.js': 'import{a}from"./A.js";export const b=a;',
      'dist/esm/chunks/C.js': 'export const c=3;',
      'dist/esm/diagrams/pie.js':
        'import{b}from"../chunks/B.js";import"../chunks/A.js";export{b as default};',
    });
    const compare = compareChunks(dir);
    const gz = (p: string) => sizeOf(p, readFileSync(join(dir, 'dist/esm', p))).gzip;
    expect(compare.version).toBe('9.9.9');
    expect(compare.core).toBe(gz('core.js') + gz('chunks/A.js'));
    // The dynamic import in lazy.js is not followed; A.js is core's.
    expect(compare.diagrams).toEqual([
      { diagram: 'pie', closure: gz('diagrams/pie.js') + gz('chunks/B.js') },
    ]);
    expect(compare.files).toBe(6);
  });

  // The bench's own compare package, against the figures spec #813 measured (decimal KB: 19.2 KB gz core,
  // 313 KB over 122 files). A bump of the compare package fails here on purpose: re-measure and update the figures.
  it('measures the pinned compare 1.13.0 as spec #813 did', () => {
    const compare = compareChunks();
    expect(compare.version).toBe('1.13.0');
    expect(Math.round(compare.core / 100) / 10).toBe(19.2);
    expect(Math.round(compare.total / 1000)).toBe(313);
    expect(compare.files).toBe(122);
  }, 30_000);
});
