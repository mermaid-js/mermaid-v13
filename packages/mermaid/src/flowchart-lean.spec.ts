/**
 * Flowchart parses lean for a draw (DESIGN §4.2, R-PARSE-8): `data-ast` is off unless the
 * integrator or an extension that reads the AST turns it on, and a cached lean analysis never
 * changes what another call that reads the AST gets (text output, `prepare()`, blocks).
 */
import { describe, expect, it } from 'vitest';
import type { ExtensionPlugin } from '@mermaid-js/core';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { flowchart, type FlowModel } from '@mermaid-js/diagram-flowchart';
import { createMermaid } from './index.ts';
import type { InitializeConfig } from './api.ts';

const FLOW = [
  'flowchart LR',
  '  subgraph S [Lane]',
  '    A[Start] -->|go| B{Choice}',
  '  end',
  '  B --> C',
  '  B --> C',
  '  style C fill:#f9f',
].join('\n');

const AST_ATTR = / data-ast="[^"]*"/g;
const api = (config: InitializeConfig = {}) => {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m;
};

describe('flowchart data-ast (R-PARSE-8)', () => {
  it('draws no data-ast by default, and the same drawing with it when the integrator asks', async () => {
    const plain = await api().render('f', FLOW);
    const on = await api({ output: { dataAst: true } }).render('f', FLOW);
    expect(plain.svg).not.toContain('data-ast');
    expect([...on.svg.matchAll(AST_ATTR)].map((m) => m[0])).toEqual(
      expect.arrayContaining([' data-ast="n:A"', ' data-ast="e:B&gt;C#2"', ' data-ast="s:S"'])
    );
    expect(on.svg.replace(AST_ATTR, '')).toBe(plain.svg);
    expect(on.warnings).toEqual(plain.warnings);
  });

  it('draws data-ast for an extension that reads the AST, which gets the full parse', async () => {
    const asts: AstNode[] = [];
    const reader: ExtensionPlugin = { id: 'reader', postParse: (ast) => (asts.push(ast), ast) };
    const m = api();
    await m.registerExternalDiagrams([reader]);
    expect((await m.render('f', FLOW)).svg).toContain('data-ast="n:A"');
    expect(m.renderSync(FLOW, { id: 'f' }).svg).toContain('data-ast="n:A"');
    // Header, subgraph, two chains and the style statement.
    expect(asts.map((a) => a.children?.length)).toEqual([5, 5]);
  });

  it('hands prepare() the full parse, with the model ids, after a lean draw of the same text', async () => {
    const m = api();
    await m.render('f', FLOW);
    const { parse } = await m.prepare(FLOW);
    expect(parse.ast.type).toBe('Document');
    expect(parse.symbols.length).toBeGreaterThan(0);
    expect((parse.model as FlowModel).vertices.map((v) => v.ast)).toEqual(['n:A', 'n:B', 'n:C']);
  });

  it('gives text output its AST ids whether an SVG draw of the text came first or not', async () => {
    const first = api();
    await first.render('f', FLOW);
    const after = await first.render('f', FLOW, { format: 'ascii' });
    const alone = await api().render('f', FLOW, { format: 'ascii' });
    expect(after).toEqual(alone);
    expect(alone.warnings.flatMap((w) => w.astIds ?? [])).toContain('n:C');
    // And an SVG draw after text output stays without data-ast.
    expect((await first.render('f', FLOW)).svg).not.toContain('data-ast');
  });

  it('keeps the swimlane warnings’ AST ids without data-ast', async () => {
    const lanes = `---\nconfig:\n  layout: swimlane\n---\n${FLOW.replace('    A[Start]', '    subgraph T\n      X\n    end\n    A[Start]')}`;
    const off = await api().render('f', lanes);
    const on = await api({ output: { dataAst: true } }).render('f', lanes);
    const ids = (r: { warnings: readonly { astIds?: readonly string[] }[] }) =>
      r.warnings.flatMap((w) => w.astIds ?? []);
    expect(ids(off)).toContain('s:T');
    expect(ids(off)).toEqual(ids(on));
    expect(off.svg).not.toContain('data-ast');
  });

  it('draws an embedded block the same in both orders of SVG and text output', async () => {
    const host = [
      'flowchart LR',
      '  A --> b',
      '  mermaid b["Block"] {',
      '    flowchart TD',
      '      X --> Y',
      '  }',
    ].join('\n');
    const svgFirst = api();
    const svg = (await svgFirst.render('h', host)).svg;
    const text = await svgFirst.render('h', host, { format: 'ascii' });
    const textFirst = api();
    expect(await textFirst.render('h', host, { format: 'ascii' })).toEqual(text);
    expect((await textFirst.render('h', host)).svg).toBe(svg);
    expect(svg).not.toContain('data-ast');
  });

  it('draws text output of a cached text with the full parse its entry keeps: no parse', async () => {
    const m = api();
    const real = flowchart.parse;
    let parses = 0;
    flowchart.parse = (text, ctx) => (parses++, real(text, ctx));
    try {
      const first = await m.render('f', FLOW, { format: 'ascii' });
      for (let i = 0; i < 3; i++) expect(m.renderSync(FLOW, { format: 'ascii' })).toEqual(first);
      expect(parses).toBe(1);
      // An entry made lean by an SVG draw is filled by the first text output, then kept.
      await m.render('g', `${FLOW}\n%% other`);
      for (let i = 0; i < 3; i++) m.renderSync(`${FLOW}\n%% other`, { format: 'ascii' });
      expect(parses).toBe(3);
    } finally {
      flowchart.parse = real;
    }
  });
});
