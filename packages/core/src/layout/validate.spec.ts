import { describe, expect, it } from 'vitest';
import type { LayoutGraph, LayoutModel } from './types.ts';
import { countCrossings, titleCrossings, validateLayout } from './validate.ts';

const graph: LayoutGraph = {
  direction: 'TB',
  nodes: [
    { id: 'a', width: 40, height: 20 },
    { id: 'b', width: 40, height: 20, parent: 'g' },
  ],
  edges: [{ id: 'e', source: 'a', target: 'b', minLen: 1 }],
  groups: [{ id: 'g', padding: { top: 10, right: 10, bottom: 10, left: 10 } }],
  spacing: { node: 50, rank: 50, edge: 20 },
};

function good(): LayoutModel {
  return {
    width: 100,
    height: 120,
    direction: 'TB',
    nodes: new Map([
      ['a', { x: 50, y: 10, width: 40, height: 20 }],
      ['b', { x: 50, y: 90, width: 40, height: 20 }],
    ]),
    groups: new Map([['g', { x: 50, y: 90, width: 60, height: 40, title: { x: 50, y: 75 } }]]),
    edges: new Map([
      [
        'e',
        {
          points: [
            { x: 50, y: 20, axis: 'v' },
            { x: 50, y: 80, axis: 'v' },
          ],
          ports: { source: 'bottom', target: 'top' },
        },
      ],
    ]),
  };
}

describe('validateLayout: edge-end labels (D102)', () => {
  const labelled: LayoutGraph = {
    ...graph,
    edges: [
      {
        id: 'e',
        source: 'a',
        target: 'b',
        minLen: 1,
        label: { width: 20, height: 10 },
        startLabel: { width: 10, height: 10 },
        endLabel: { width: 10, height: 10 },
      },
    ],
  };
  const placed = (start: { x: number; y: number }, end = { x: 60, y: 72 }): LayoutModel => {
    const model = good();
    const e = model.edges.get('e')!;
    model.edges.set('e', { ...e, label: { x: 50, y: 50 }, startLabel: start, endLabel: end });
    return model;
  };

  it('accepts end labels clear of nodes and of the edge’s other labels', () => {
    expect(validateLayout(labelled, placed({ x: 60, y: 28 }))).toEqual([]);
  });

  it('reports an end label without a position', () => {
    const model = good();
    model.edges.get('e')!.label = { x: 50, y: 50 };
    expect(validateLayout(labelled, model)).toContainEqual(
      "edge 'e' has a start label but no start label position"
    );
  });

  it('reports an end label over a node', () => {
    expect(validateLayout(labelled, placed({ x: 60, y: 18 }))).toContainEqual(
      "start label of edge 'e' overlaps node 'a'"
    );
  });

  it('reports end labels over each other or the middle label', () => {
    expect(validateLayout(labelled, placed({ x: 55, y: 50 }))).toContainEqual(
      "start label of edge 'e' overlaps its label"
    );
    expect(validateLayout(labelled, placed({ x: 60, y: 70 }))).toContainEqual(
      "end label of edge 'e' overlaps its start label"
    );
  });

  it('reports an end label over another edge’s labels', () => {
    const two: LayoutGraph = {
      ...labelled,
      edges: [
        labelled.edges[0]!,
        { id: 'f', source: 'a', target: 'b', minLen: 1, startLabel: { width: 10, height: 10 } },
      ],
    };
    const model = placed({ x: 60, y: 28 });
    const f = model.edges.get('e')!;
    model.edges.set('f', {
      ...f,
      label: undefined,
      endLabel: undefined,
      startLabel: { x: 62, y: 30 },
    });
    expect(validateLayout(two, model)).toContainEqual(
      "start label of edge 'f' overlaps start label of edge 'e'"
    );
    model.edges.set('f', {
      ...f,
      label: undefined,
      endLabel: undefined,
      startLabel: { x: 50, y: 52 },
    });
    expect(validateLayout(two, model)).toContainEqual(
      "start label of edge 'f' overlaps label of edge 'e'"
    );
  });

  it('reports a non-finite end label', () => {
    expect(validateLayout(labelled, placed({ x: NaN, y: 28 }))).toContainEqual(
      "edge 'e' has a non-finite coordinate"
    );
  });
});

describe('validateLayout', () => {
  it('accepts a valid model', () => {
    expect(validateLayout(graph, good())).toEqual([]);
  });

  it('reports overlapping nodes', () => {
    const model = good();
    model.nodes.set('a', { x: 50, y: 80, width: 40, height: 20 });
    expect(validateLayout(graph, model)).toContainEqual(expect.stringContaining('overlap'));
  });

  it('reports NaN and Infinity', () => {
    const model = good();
    model.nodes.set('a', { x: NaN, y: 10, width: 40, height: 20 });
    model.width = Infinity;
    const problems = validateLayout(graph, model);
    expect(problems).toContainEqual(expect.stringContaining("node 'a'"));
    expect(problems).toContainEqual(expect.stringContaining('width'));
  });

  it('reports a child outside its group', () => {
    const model = good();
    model.groups.set('g', { x: 50, y: 100, width: 60, height: 10, title: { x: 50, y: 95 } });
    expect(validateLayout(graph, model)).toContainEqual(expect.stringContaining('outside'));
  });

  it('reports missing nodes and edges ends away from their nodes', () => {
    const model = good();
    model.nodes.delete('a');
    model.edges.get('e')!.points[1] = { x: 0, y: 0, axis: 'v' };
    const problems = validateLayout(graph, model);
    expect(problems).toContainEqual(expect.stringContaining("missing node 'a'"));
    expect(problems).toContainEqual(expect.stringContaining('target'));
  });
});

describe('validateLayout labels', () => {
  it('reports an edge label over a node', () => {
    const labelled: LayoutGraph = {
      ...graph,
      edges: [{ id: 'e', source: 'a', target: 'b', minLen: 1, label: { width: 30, height: 16 } }],
    };
    const model = good();
    model.edges.get('e')!.label = { x: 50, y: 50 };
    expect(validateLayout(labelled, model)).toEqual([]);
    model.edges.get('e')!.label = { x: 50, y: 15 };
    expect(validateLayout(labelled, model)).toContainEqual(
      expect.stringContaining("label of edge 'e'")
    );
  });
});

describe('countCrossings', () => {
  it('counts proper crossings between edge routes', () => {
    const model = good();
    model.edges.set('x', {
      points: [
        { x: 0, y: 0, axis: 'v' },
        { x: 100, y: 100, axis: 'v' },
      ],
      ports: { source: 'bottom', target: 'top' },
    });
    model.edges.set('y', {
      points: [
        { x: 100, y: 0, axis: 'v' },
        { x: 0, y: 100, axis: 'v' },
      ],
      ports: { source: 'bottom', target: 'top' },
    });
    // x crosses y and the vertical edge e; y crosses e too; they all meet once in the middle.
    expect(countCrossings(model)).toBe(3);
  });

  it('does not count edges that share an end', () => {
    const model = good();
    model.edges.set('f', {
      points: [
        { x: 50, y: 20, axis: 'v' },
        { x: 90, y: 80, axis: 'v' },
      ],
      ports: { source: 'bottom', target: 'top' },
    });
    expect(countCrossings(model)).toBe(0);
  });
});

describe('validateLayout: `border` ends (D501)', () => {
  // The end meets the group's top border (y 70), 10 above node b's box.
  const atBorder = (): LayoutModel => {
    const model = good();
    model.edges.get('e')!.points[1] = { x: 50, y: 70, axis: 'v' };
    return model;
  };

  it('takes a border end at the box of the node’s group', () => {
    const bordered = { ...graph, edges: [{ ...graph.edges[0]!, border: { target: true } }] };
    expect(validateLayout(bordered, atBorder())).toEqual([]);
  });

  it('still wants a plain end at its node', () => {
    expect(validateLayout(graph, atBorder())).toEqual(["edge 'e' does not end at its target"]);
  });
});

describe('validateLayout: `border` ends lie on the right group border (D501)', () => {
  const bordered = { ...graph, edges: [{ ...graph.edges[0]!, border: { target: true } }] };

  it('refuses a border end inside the group but off its border', () => {
    const model = good();
    // Inside g (y 70..110), above b (y 80..100), on no side of g.
    model.edges.get('e')!.points[1] = { x: 50, y: 75, axis: 'v' };
    expect(validateLayout(bordered, model)).toEqual(["edge 'e' does not end at its target"]);
  });

  it('takes an end on a group at that group, not its parent, with or without `border`', () => {
    const nested: LayoutGraph = {
      ...graph,
      nodes: [graph.nodes[0]!],
      groups: [
        { id: 'p', padding: { top: 10, right: 10, bottom: 10, left: 10 } },
        { id: 'g', parent: 'p', padding: { top: 10, right: 10, bottom: 10, left: 10 } },
      ],
      edges: [{ id: 'e', source: 'a', target: 'g', minLen: 1, border: { target: true } }],
    };
    const model: LayoutModel = {
      ...good(),
      nodes: new Map([['a', { x: 50, y: 10, width: 40, height: 20 }]]),
      groups: new Map([
        ['p', { x: 50, y: 85, width: 80, height: 70, title: { x: 50, y: 55 } }],
        ['g', { x: 50, y: 90, width: 40, height: 40, title: { x: 50, y: 75 } }],
      ]),
      edges: new Map([
        [
          'e',
          {
            points: [
              { x: 50, y: 20, axis: 'v' },
              // On p's top border, well above g.
              { x: 50, y: 50, axis: 'v' },
            ],
            ports: { source: 'bottom', target: 'top' },
          },
        ],
      ]),
    };
    expect(validateLayout(nested, model)).toEqual(["edge 'e' does not end at its target"]);
    model.edges.get('e')!.points[1] = { x: 50, y: 70, axis: 'v' };
    expect(validateLayout(nested, model)).toEqual([]);
  });
});

describe('titleCrossings (#675)', () => {
  // The group's title box is x 40..60, y 70..80 in `good()`.
  const titled: LayoutGraph = {
    ...graph,
    groups: [{ ...graph.groups[0]!, title: { width: 20, height: 10 } }],
  };
  const routed = (...points: [number, number][]): LayoutModel => {
    const model = good();
    const e = model.edges.get('e')!;
    model.edges.set('e', { ...e, points: points.map(([x, y]) => ({ x, y, axis: 'v' })) });
    return model;
  };

  it('names an edge whose route runs through the title', () => {
    expect(titleCrossings(titled, good())).toEqual(['e x g']);
  });

  it('names a route that ends inside the title', () => {
    expect(titleCrossings(titled, routed([50, 20], [50, 75]))).toEqual(['e x g']);
  });

  it('names a route that crosses the title on a slant or across', () => {
    expect(titleCrossings(titled, routed([30, 60], [70, 90]))).toEqual(['e x g']);
    expect(titleCrossings(titled, routed([30, 75], [70, 75]))).toEqual(['e x g']);
  });

  it('passes a route beside the title, along its side or within the slack', () => {
    expect(titleCrossings(titled, routed([65, 20], [65, 90]))).toEqual([]);
    expect(titleCrossings(titled, routed([60, 20], [60, 90]))).toEqual([]);
    expect(titleCrossings(titled, routed([59.6, 20], [59.6, 90]))).toEqual([]);
    expect(titleCrossings(titled, routed([59.4, 20], [59.4, 90]))).toEqual(['e x g']);
  });

  // With the slack, the box counted is x 40.5..59.5, y 70.5..79.5.
  it('counts no route that lies on a side of the box counted', () => {
    expect(titleCrossings(titled, routed([40.5, 72], [40.5, 78]))).toEqual([]);
    expect(titleCrossings(titled, routed([59.5, 72], [59.5, 78]))).toEqual([]);
    expect(titleCrossings(titled, routed([45, 79.5], [55, 79.5]))).toEqual([]);
    expect(titleCrossings(titled, routed([30, 70.2], [70, 70.2]))).toEqual([]);
  });

  it('names a route that starts or ends inside the box from a point on its side', () => {
    expect(titleCrossings(titled, routed([40.5, 75], [50, 75]))).toEqual(['e x g']);
    expect(titleCrossings(titled, routed([50, 75], [40.5, 75]))).toEqual(['e x g']);
  });

  it('names a route that cuts a corner of the box', () => {
    expect(titleCrossings(titled, routed([45, 60], [65, 80]))).toEqual(['e x g']);
  });

  it('skips a group without a title', () => {
    expect(titleCrossings(graph, good())).toEqual([]);
  });
});
