import { describe, expect, it, vi } from 'vitest';
import { layered } from '@mermaid-js/core/layout';
import { ParseState } from '@mermaid-js/core/parser-kit';
import { flowchart, parseFlowchart } from '@mermaid-js/diagram-flowchart';
import { ascii } from '@mermaid-js/diagram-flowchart/ascii';
import { createMermaid } from './slim.ts';
import { createMermaid as createFullMermaid } from './index.ts';

const SOURCE =
  'graph TD\n subgraph S[Group]\n A[Hello] --> B\n end\n classDef hot fill:red\n class A hot';

describe('prepared lazy flowchart metadata', () => {
  it('leaves metadata unbuilt through plain SVG, then memoizes it across cached prepares', async () => {
    const m = createMermaid({ diagrams: [flowchart] });
    const symbols = vi.spyOn(ParseState.prototype, 'symbol');
    try {
      const prepared = await m.prepare(SOURCE);
      const before = m.renderSync(SOURCE).svg;
      expect(symbols).not.toHaveBeenCalled();
      const ast = prepared.parse.ast;
      const count = symbols.mock.calls.length;
      expect(count).toBeGreaterThan(0);
      expect((await m.prepare(SOURCE)).parse.ast).toBe(ast);
      expect(m.renderSync(SOURCE).svg).toBe(before);
      expect(symbols).toHaveBeenCalledTimes(count);
      expect(ast).toEqual(parseFlowchart(SOURCE).ast);
    } finally {
      symbols.mockRestore();
    }
  });

  it('retains original source/config after eviction and independent preparations', async () => {
    const m = createMermaid({ diagrams: [flowchart] });
    const config = { flowchart: { inheritDir: true } };
    const first = await m.prepare(SOURCE, { config });
    config.flowchart.inheritDir = false;
    await m.prepare(SOURCE, { config });
    for (let i = 0; i < 40; i++) await m.prepare(`graph TD\n A${i} --> B${i}`);
    expect(first.parse.ast).toEqual(parseFlowchart(SOURCE, { inheritDir: true }).ast);
    expect(first.parse.symbols).toEqual(parseFlowchart(SOURCE).symbols);
    const other = await createMermaid({ diagrams: [flowchart] }).prepare(SOURCE);
    expect(other.parse.ast).toEqual(first.parse.ast);
    expect(other.parse.ast).not.toBe(first.parse.ast);
  });

  it('supports arbitrary diagram resources reading metadata during prepare', async () => {
    const seen: unknown[] = [];
    const plugin = {
      ...flowchart,
      resources(parse: ReturnType<typeof parseFlowchart>) {
        seen.push(structuredClone(parse));
        return [];
      },
    };
    const m = createMermaid({ diagrams: [plugin] });
    const prepared = await m.prepare(SOURCE);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toEqual(structuredClone(prepared.parse));
    expect(prepared.parse.ast).toEqual(parseFlowchart(SOURCE).ast);
  });

  it('passes complete AST to a layout-loader extension after a plain cached prepare', async () => {
    const m = createMermaid({ diagrams: [flowchart] });
    await m.prepare(SOURCE);
    const seen: unknown[] = [];
    m.registerLayoutLoaders([
      {
        name: 'lazy-test-layout',
        loader: async () => layered,
        extension: {
          id: 'lazy-test-hook',
          postParse(ast) {
            seen.push(ast);
            return ast;
          },
        },
      },
    ]);
    await m.render('test', SOURCE, { config: { layout: 'lazy-test-layout' } });
    expect(seen).toEqual([parseFlowchart(SOURCE).ast]);
  });

  it('preserves ASCII warnings and AST ids when SVG preparation is reused', async () => {
    const m = createFullMermaid();
    const prepared = await m.prepare(SOURCE);
    expect(Object.getOwnPropertyDescriptor(prepared.parse, 'ast')?.get).toBeTypeOf('function');
    await m.prepare(SOURCE, { format: 'ascii' });
    const reused = m.renderSync(SOURCE, { format: 'ascii' });
    const eager = createMermaid({ diagrams: [{ ...flowchart, ascii }] });
    await eager.prepare(SOURCE, { format: 'ascii' });
    expect(reused).toEqual(eager.renderSync(SOURCE, { format: 'ascii' }));
    expect(prepared.parse.ast).toEqual(parseFlowchart(SOURCE).ast);
  });
});
