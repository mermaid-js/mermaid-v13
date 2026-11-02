import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countCrossings, layered, validateLayout } from '@mermaid-js/core/layout';
import { renderForTest } from '@mermaid-js/diagram-flowchart/testing';
import { REPO_ROOT, corpusFromDir } from './index.ts';

// DDLT-style checks on parser-produced LayoutGraphs (DESIGN §6.2): the e2e flowchart corpus,
// parsed by the v13 parser and measured with the table measurer, so the fixtures are always
// fresh. Every graph must lay out validly; crossing counts are snapshotted.
describe('layered over parser-produced flowchart graphs', () => {
  it('lays out every corpus graph validly and records crossings', async () => {
    const crossings: Record<string, number> = {};
    for await (const item of corpusFromDir(
      join(REPO_ROOT, 'e2e/diagrams/flowchart'),
      'flowchart'
    )) {
      let graph;
      try {
        graph = (await renderForTest(item.source)).layout.flow!.graph;
      } catch (e) {
        if ((e as Error).message.startsWith('parse failed')) continue;
        throw e;
      }
      const model = layered(graph);
      expect(validateLayout(graph, model), item.id).toEqual([]);
      crossings[item.id] = countCrossings(model);
    }
    expect(Object.keys(crossings).length).toBeGreaterThan(350);
    expect(crossings).toMatchSnapshot();
  });
});
