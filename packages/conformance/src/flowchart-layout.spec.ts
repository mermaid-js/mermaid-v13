import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countCrossings, layered, validateLayout, type LayoutGraph } from '@mermaid-js/core/layout';
import { createMermaid, MermaidError } from 'mermaid';
import { REPO_ROOT, corpusFromDir } from './index.ts';

// DDLT-style checks on parser-produced LayoutGraphs (DESIGN §6.2): the e2e flowchart corpus,
// parsed by the v13 parser and measured with the table measurer, so the fixtures are always
// fresh. The graphs are captured through the public API with a layout engine registered by
// `registerLayoutLoaders` that records its input. Every graph must lay out validly; crossing
// counts are snapshotted.
describe('layered over parser-produced flowchart graphs', () => {
  it('lays out every corpus graph validly and records crossings', async () => {
    const crossings: Record<string, number> = {};
    let captured: LayoutGraph | undefined;
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const capture = (graph: LayoutGraph) => {
      captured = graph;
      return layered(graph);
    };
    // Every name the corpus selects, so front matter `layout:` is captured too.
    m.registerLayoutLoaders(
      ['layered', 'dagre', 'elk', 'elk.box', 'elk.rectpacking'].map((name) => ({
        name,
        loader: () => Promise.resolve(capture),
      }))
    );
    for await (const item of corpusFromDir(
      join(REPO_ROOT, 'e2e/diagrams/flowchart'),
      'flowchart'
    )) {
      captured = undefined;
      try {
        await m.render('mermaid-0', item.source);
      } catch (e) {
        if (e instanceof MermaidError && e.code !== 'INTERNAL') continue;
        throw e;
      }
      const graph = captured;
      expect(graph, item.id).toBeDefined();
      if (!graph) continue;
      const model = layered(graph);
      expect(validateLayout(graph, model), item.id).toEqual([]);
      crossings[item.id] = countCrossings(model);
    }
    expect(Object.keys(crossings).length).toBeGreaterThan(350);
    expect(crossings).toMatchSnapshot();
  });
});
