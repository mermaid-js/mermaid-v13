/** The markdown of the size report (#814). */
import { describe, expect, it } from 'vitest';
import { codeSizeLines } from './code-size-markdown.ts';
import type { CodeSizeReport } from './code-size.ts';

const report: CodeSizeReport = {
  lines: {
    packages: [
      { pkg: 'bench', total: 50, byCategory: { tooling: 50 } },
      { pkg: 'core', total: 300, byCategory: { parsing: 100, render: 200 } },
      { pkg: 'diagram-pie', total: 700, byCategory: { parsing: 400, test: 300 } },
    ],
    byCategory: { tooling: 50, parsing: 500, render: 200, test: 300 },
    total: 1000,
    unclassified: [],
  },
  chunks: {
    core: 100_000,
    loaded: 140_000,
    diagrams: [
      { pkg: 'diagram-flowchart', chunk: 30_000, closure: 40_000 },
      { pkg: 'diagram-gitgraph', chunk: 9000, closure: 9500 },
      {
        pkg: 'diagram-mindmap',
        chunk: 8000,
        closure: 8500,
        layout: { engine: 'tree', bytes: 3407 },
      },
    ],
    total: 400_000,
    files: 90,
  },
  compare: {
    version: '1.13.0',
    core: 19_221,
    diagrams: [
      { diagram: 'flowchart', closure: 48_494 },
      { diagram: 'gitGraph', closure: 7000 },
      { diagram: 'mindmap', closure: 12_000 },
      { diagram: 'swimlane', closure: 3000 },
    ],
    total: 313_373,
    files: 122,
  },
};

describe('codeSizeLines', () => {
  const md = codeSizeLines(report).join('\n');

  it('gives the lines by category with each share of the published total', () => {
    expect(md).toContain(
      '| Parsing (lexers, parsers, AST, model building, preprocess) | 500 | 50.0% |'
    );
    expect(md).toContain('| Test support kept in src | 300 | 30.0% |');
    expect(md).toContain('| **Published packages** | **1,000** | 100% |');
    expect(md).toContain(
      '| Private tooling (bench, conformance, dev); not in the spec #813 total | 50 |  |'
    );
  });

  it('puts the published total below every row it includes, unmatched files too', () => {
    const withUnmatched = codeSizeLines({
      lines: {
        ...report.lines,
        byCategory: { ...report.lines.byCategory, unclassified: 7 },
        total: 1007,
        unclassified: ['packages/core/src/x/y.ts'],
      },
    });
    const at = (prefix: string) => withUnmatched.findIndex((l) => l.startsWith(prefix));
    expect(at('| Matched by no category | 7 |')).toBeGreaterThan(at('| Test support'));
    expect(at('| **Published packages** |')).toBeGreaterThan(at('| Matched by no category'));
    expect(at('| Private tooling')).toBeGreaterThan(at('| **Published packages** |'));
  });

  it('gives each package a row with its lines in every category, under short labels', () => {
    expect(md).toMatch(/\| Package \| Total \| Parsing \| Render \| Test \| Tooling \|/);
    expect(md).toContain('| diagram-pie | 700 | 400 | – | 300 | – |');
  });

  it('puts each diagram next to the compare entry of the same type', () => {
    expect(md).toMatch(
      /\| Diagram \| v13 chunk \| v13 static closure \| v13 default layout \| v13 render \| compare 1\.13\.0 \|/
    );
    expect(md).toContain('| core | 100,000 |  |  |  | 19,221 |');
    expect(md).toContain('| core + flowchart (loaded) | 140,000 |  |  |  | 67,715 |');
    expect(md).toContain('| flowchart | 30,000 | 40,000 | – | 40,000 | 48,494 |');
    expect(md).toContain('| gitgraph | 9,000 | 9,500 | – | 9,500 | 7,000 |');
    expect(md).toContain('| swimlane (compare only) | – | – | – | – | 3,000 |');
    expect(md).toContain('| all files | 400,000 (90 files) |  |  |  | 313,373 (122 files) |');
  });

  it('adds the default layout chunk the registry loads to the render figure', () => {
    expect(md).toContain('| mindmap | 8,000 | 8,500 | tree 3,407 | 11,907 | 12,000 |');
  });
});
