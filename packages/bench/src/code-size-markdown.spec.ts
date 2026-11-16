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
    ],
    total: 400_000,
    files: 90,
  },
  pele: {
    version: '1.13.0',
    core: 19_221,
    diagrams: [
      { diagram: 'flowchart', closure: 48_494 },
      { diagram: 'gitGraph', closure: 7000 },
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

  it('gives each package a row with its lines in every category', () => {
    expect(md).toMatch(/\| Package \| Total \| parsing \| render \| test \| tooling \|/);
    expect(md).toContain('| diagram-pie | 700 | 400 | – | 300 | – |');
  });

  it('puts each diagram next to the Pele entry of the same type', () => {
    expect(md).toContain('| core | 100,000 |  | 19,221 |');
    expect(md).toContain('| core + flowchart (loaded) | 140,000 |  | 67,715 |');
    expect(md).toContain('| flowchart | 30,000 | 40,000 | 48,494 |');
    expect(md).toContain('| gitgraph | 9,000 | 9,500 | 7,000 |');
    expect(md).toContain('| swimlane (Pele only) | – | – | 3,000 |');
    expect(md).toContain('| all files | 400,000 (90 files) |  | 313,373 (122 files) |');
  });
});
