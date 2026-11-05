import { describe, expect, it } from 'vitest';
import { validateLayout, type LayoutGraph } from '@mermaid-js/core/layout';
import { elkEngine, type ElkAlgorithm } from './adapter.ts';

const spacing = { node: 50, rank: 50, edge: 20 };

/** Two nodes in a titled group, one outside, a labelled edge into the group and a self loop. */
const grouped = (): LayoutGraph => ({
  direction: 'TB',
  spacing,
  diagramPadding: 8,
  nodes: [
    { id: 'A', width: 60, height: 40 },
    { id: 'B', width: 80, height: 40, parent: 'G' },
    { id: 'C', width: 40, height: 40, parent: 'G' },
  ],
  edges: [
    { id: 'e1', source: 'A', target: 'B', minLen: 1, label: { width: 30, height: 14 } },
    { id: 'e2', source: 'B', target: 'C', minLen: 1, endLabel: { width: 8, height: 10 } },
    { id: 'e3', source: 'A', target: 'G', minLen: 1 },
  ],
  groups: [
    {
      id: 'G',
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
      title: { width: 120, height: 20 },
    },
  ],
});

const chain = (direction: LayoutGraph['direction']): LayoutGraph => ({
  direction,
  spacing,
  nodes: [
    { id: 'A', width: 40, height: 20 },
    { id: 'B', width: 40, height: 20 },
  ],
  edges: [{ id: 'e', source: 'A', target: 'B', minLen: 1 }],
  groups: [],
});

const ALL: ElkAlgorithm[] = [
  'layered',
  'stress',
  'force',
  'mrtree',
  'sporeOverlap',
  'box',
  'rectpacking',
];
// ELK's stress and force place by edge length alone, so boxes may overlap (as in v12).
const MAY_OVERLAP = new Set<ElkAlgorithm>(['stress', 'force']);

describe('elkEngine (LayoutGraph → ELK → LayoutModel)', () => {
  it('lays A → B out with ELK layered: rank spacing between them, in the flow direction', () => {
    const down = elkEngine('layered')(chain('TB'));
    const a = down.nodes.get('A')!;
    const b = down.nodes.get('B')!;
    // ELK layered, not the built-in engine: boxes at the padding, ranks `spacing.rank` apart.
    expect(a).toEqual({ x: 20, y: 10, width: 40, height: 20 });
    expect(b).toEqual({ x: 20, y: 80, width: 40, height: 20 });
    expect(down).toMatchObject({ width: 40, height: 90, direction: 'TB' });
    expect(down.edges.get('e')).toEqual({
      points: [
        { x: 20, y: 20, axis: 'v' },
        { x: 20, y: 70, axis: 'v' },
      ],
      ports: { source: 'bottom', target: 'top' },
    });
  });

  it.each([
    ['BT', 'top', 'bottom'],
    ['LR', 'right', 'left'],
    ['RL', 'left', 'right'],
  ] as const)('follows direction %s', (direction, source, target) => {
    const model = elkEngine('layered')(chain(direction));
    expect(model.edges.get('e')!.ports).toEqual({ source, target });
  });

  it.each(ALL)('gives a valid model for a grouped graph with %s', (algorithm) => {
    const graph = grouped();
    const model = elkEngine(algorithm)(graph);
    const problems = validateLayout(graph, model);
    if (MAY_OVERLAP.has(algorithm))
      expect(problems.filter((p) => !p.includes('overlap'))).toEqual([]);
    else expect(problems).toEqual([]);
    expect([...model.edges.keys()]).toEqual(['e1', 'e2', 'e3']);
    const e1 = model.edges.get('e1')!;
    expect(e1.label).toBeDefined();
    expect(model.edges.get('e2')!.endLabel).toBeDefined();
    const g = model.groups.get('G')!;
    // The title sits in the top band, centred across the group.
    expect(g.title.x).toBeCloseTo(g.x);
    expect(g.title.y).toBeCloseTo(g.y - g.height / 2 + 8 / 2 + 20 / 2);
    expect(g.width).toBeGreaterThanOrEqual(120 + 16);
  });

  it('lays out the same graph to the same model every time (no $H, R-API-2)', () => {
    const first = elkEngine('layered')(grouped());
    expect(elkEngine('layered')(grouped())).toEqual(first);
    expect(JSON.stringify([...first.nodes, ...first.edges, ...first.groups])).not.toContain('$H');
  });

  it('elk.radial lays out a tree, and throws ELK’s error for a graph that is not one', () => {
    const tree = chain('TB');
    expect(validateLayout(tree, elkEngine('radial')(tree))).toEqual([]);
    expect(() => elkEngine('radial')(grouped())).toThrow(/not a tree/);
  });
});
