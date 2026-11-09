import { describe, expect, it } from 'vitest';
import type { LayoutGraph, LayoutModel } from './types.ts';
import { countCrossings, validateLayout } from './validate.ts';

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
