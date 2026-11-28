import { describe, expect, it } from 'vitest';
import { loadFixtures } from './fixtures.ts';

describe('bench fixtures (R-PERF-6)', () => {
  const fixtures = loadFixtures();

  it('commits the 158-diagram flowchart corpus with its manifest', () => {
    const corpus = fixtures.filter((f) => f.set === 'corpus');
    expect(corpus).toHaveLength(158);
    expect(corpus.every((f) => f.type === 'flowchart')).toBe(true);
    // The manifest byte counts are an independent record of what was synced.
    expect(corpus.filter((f) => Buffer.byteLength(f.source) !== f.bytes)).toEqual([]);
    expect(new Set(corpus.map((f) => f.tier))).toEqual(
      new Set(['tiny', 'regular', 'large', 'huge'])
    );
  });

  it('commits the #8635 / compare set: 7-, 50- and 500-node flowcharts, sequence and class', () => {
    const compare = Object.fromEntries(
      fixtures.filter((f) => f.set === 'compare').map((f) => [f.id, f])
    );
    expect(Object.keys(compare).sort()).toEqual([
      'compare/class',
      'compare/flowchart-50',
      'compare/flowchart-500',
      'compare/flowchart-7',
      'compare/sequence',
    ]);
    expect(compare['compare/sequence']?.source.startsWith('sequenceDiagram\n')).toBe(true);
    expect(compare['compare/class']?.source.startsWith('classDiagram\n')).toBe(true);
    // A fan-out-3 tree of n nodes has n - 1 edges, one per line after the header.
    const edges = (id: string) => (compare[id]?.source.match(/-->/g) ?? []).length;
    expect(edges('compare/flowchart-50')).toBe(49);
    expect(edges('compare/flowchart-500')).toBe(499);
    expect(compare['compare/flowchart-500']?.source).toContain(
      '  n166[Node 166] --> n499[Node 499]\n'
    );
    expect(compare['compare/flowchart-7']?.source).toContain('B -->|Yes| C[Ship it]');
  });

  it('gives every fixture a unique id', () => {
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(fixtures.length);
  });
});
