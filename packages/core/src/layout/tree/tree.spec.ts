import { describe, expect, it } from 'vitest';
import type { LayoutGraph, LayoutModel } from '../types.ts';
import { validateLayout } from '../validate.ts';
import { tree } from './index.ts';

const SPACING = { node: 10, rank: 40, edge: 10 };

/** A graph of `[id, width, height]` nodes and `source>target` edges. */
function graph(
  nodes: [string, number, number][],
  edges: string[],
  extra: Partial<LayoutGraph> = {}
): LayoutGraph {
  return {
    direction: 'LR',
    nodes: nodes.map(([id, width, height]) => ({ id, width, height })),
    edges: edges.map((e, i) => {
      const [source, target] = e.split('>') as [string, string];
      return { id: `e${i}`, source, target, minLen: 1 };
    }),
    groups: [],
    spacing: SPACING,
    ...extra,
  };
}

const at = (m: LayoutModel, id: string) => m.nodes.get(id)!;

describe('tree: a root and its branches', () => {
  const g = graph(
    [
      ['r', 80, 40],
      ['a', 40, 20],
      ['b', 40, 20],
      ['c', 40, 20],
    ],
    ['r>a', 'r>b', 'r>c']
  );
  const m = tree(g);

  it('is a valid layout', () => {
    expect(validateLayout(g, m)).toEqual([]);
  });

  it('puts the first branches right and the rest left, split where the heights are closest', () => {
    // Cutting after `a` or after `b` leaves the sides 30 apart; the earlier cut wins, as in Pele.
    const r = at(m, 'r');
    expect(at(m, 'a').x).toBeGreaterThan(r.x);
    expect(at(m, 'b').x).toBeLessThan(r.x);
    expect(at(m, 'c').x).toBeLessThan(r.x);
  });

  it('sets each level a rank gap out from its parent', () => {
    const r = at(m, 'r');
    // 80/2 + 40 + 40/2 either side.
    expect(at(m, 'a').x - r.x).toBe(100);
    expect(r.x - at(m, 'b').x).toBe(100);
  });

  it('stacks siblings a node gap apart, in source order, and centres the root on them', () => {
    const r = at(m, 'r');
    expect(at(m, 'c').y - at(m, 'b').y).toBe(30);
    expect((at(m, 'b').y + at(m, 'c').y) / 2).toBe(r.y);
    expect(at(m, 'a').y).toBe(r.y);
  });

  it('leaves the parent on the side facing the child and enters the near side', () => {
    expect(m.edges.get('e0')!.ports).toEqual({ source: 'right', target: 'left' });
    expect(m.edges.get('e1')!.ports).toEqual({ source: 'left', target: 'right' });
    const r = at(m, 'r');
    const a = at(m, 'a');
    const [start, end] = [m.edges.get('e0')!.points[0]!, m.edges.get('e0')!.points.at(-1)!];
    expect(start).toMatchObject({ x: r.x + 40, y: r.y });
    expect(end).toMatchObject({ x: a.x - 20, y: a.y });
  });

  it('returns the direction unchanged', () => {
    expect(m.direction).toBe('LR');
    expect(tree({ ...g, direction: 'TB' }).direction).toBe('TB');
  });
});

describe('tree: input that is not one tree (D285)', () => {
  it('takes the first incoming edge as the tree edge and routes the others straight', () => {
    const g = graph(
      [
        ['r', 40, 20],
        ['a', 40, 20],
        ['b', 40, 20],
        ['c', 40, 20],
      ],
      ['r>a', 'r>b', 'b>c', 'a>c']
    );
    const m = tree(g);
    expect(validateLayout(g, m)).toEqual([]);
    // `c` hangs off `b`, its first parent, one rank gap further out (`b` is on the left).
    expect(at(m, 'b').x - at(m, 'c').x).toBe(80);
    expect(at(m, 'c').y).toBe(at(m, 'b').y);
    const other = m.edges.get('e3')!.points;
    expect(other).toHaveLength(2);
  });

  it('stacks the trees of a forest down the page, in source order, roots in line', () => {
    const g = graph(
      [
        ['r', 40, 20],
        ['a', 40, 20],
        ['s', 40, 20],
        ['b', 40, 20],
      ],
      ['r>a', 's>b']
    );
    const m = tree(g);
    expect(validateLayout(g, m)).toEqual([]);
    expect(at(m, 's').x).toBe(at(m, 'r').x);
    // One node gap between the trees' bounds.
    expect(at(m, 's').y - at(m, 'r').y).toBe(30);
  });

  it('roots a cycle at its first node', () => {
    const g = graph(
      [
        ['a', 40, 20],
        ['b', 40, 20],
        ['c', 40, 20],
      ],
      ['b>c', 'c>a', 'a>b', 'b>b']
    );
    const m = tree(g);
    expect(validateLayout(g, m)).toEqual([]);
    // `a` is the root: `b` and then `c` hang off it, and `c>a` and the loop run outside the tree.
    expect(at(m, 'b').x).toBeGreaterThan(at(m, 'a').x);
    expect(at(m, 'c').x).toBeGreaterThan(at(m, 'b').x);
    expect(m.edges.get('e3')!.ports).toEqual({ source: 'right', target: 'right' });
  });

  it('gives a group its content’s bounds and padding', () => {
    const g = graph(
      [
        ['r', 40, 20],
        ['a', 40, 20],
        ['b', 40, 20],
      ],
      ['r>a', 'a>b'],
      {
        nodes: [
          { id: 'r', width: 40, height: 20 },
          { id: 'a', width: 40, height: 20, parent: 'g' },
          { id: 'b', width: 40, height: 20, parent: 'g' },
        ],
        groups: [{ id: 'g', padding: { top: 20, right: 5, bottom: 5, left: 5 } }],
      }
    );
    const m = tree(g);
    expect(validateLayout(g, m)).toEqual([]);
    const box = m.groups.get('g')!;
    const a = at(m, 'a');
    const b = at(m, 'b');
    expect(box.width).toBe(b.x + 20 - (a.x - 20) + 10);
    expect(box.height).toBe(20 + 25);
    expect(box.title.y).toBe(box.y - box.height / 2 + 10);
  });

  it('ignores availableWidth', () => {
    const g = graph(
      [
        ['r', 200, 20],
        ['a', 200, 20],
        ['b', 200, 20],
      ],
      ['r>a', 'r>b']
    );
    const plain = (m: LayoutModel) => JSON.stringify([m.width, m.height, [...m.nodes]]);
    expect(plain(tree({ ...g, availableWidth: 100 }))).toBe(plain(tree(g)));
  });

  it('widens a level’s gap to fit edge labels and places them on the edge', () => {
    const g = graph(
      [
        ['r', 40, 20],
        ['a', 40, 20],
      ],
      ['r>a']
    );
    g.edges[0]!.label = { width: 100, height: 16 };
    const m = tree(g);
    expect(validateLayout(g, m)).toEqual([]);
    expect(at(m, 'a').x - at(m, 'r').x).toBe(140);
    expect(m.edges.get('e0')!.label).toEqual({
      x: (at(m, 'a').x + at(m, 'r').x) / 2,
      y: at(m, 'r').y,
    });
  });

  it('refuses edges to unknown ids and non-finite sizes', () => {
    expect(() => tree(graph([['r', 40, 20]], ['r>x']))).toThrow(/unknown target 'x'/);
    expect(() => tree(graph([['r', Number.NaN, 20]], []))).toThrow(RangeError);
  });
});

/** Overlaps of a group with a box that is not in it (see the D285 groups block below). */
const groupOverlap = (g: LayoutGraph, problem: string): boolean => {
  const m = /^'(.+)' and '(.+)' overlap$/.exec(problem);
  const ids = new Set(g.groups.map((x) => x.id));
  return !!m && (ids.has(m[1]!) || ids.has(m[2]!));
};

describe('tree: review findings', () => {
  it('routes an edge between zero-width boxes one above the other without NaN', () => {
    const g = graph(
      [
        ['r', 40, 20],
        ['a', 0, 10],
        ['b', 0, 10],
        ['c', 40, 10],
        ['d', 40, 10],
      ],
      ['r>a', 'r>b', 'r>c', 'r>d', 'a>b']
    );
    const m = tree(g);
    expect(validateLayout(g, m)).toEqual([]);
    expect(m.edges.get('e4')!.ports).toEqual({ source: 'bottom', target: 'top' });
  });

  it('stacks an empty group below the other groups’ boxes, padding included', () => {
    const g = graph([['r', 40, 20]], [], {
      nodes: [{ id: 'r', width: 40, height: 20, parent: 'G1' }],
      groups: [
        { id: 'G1', padding: { top: 5, right: 5, bottom: 50, left: 5 } },
        { id: 'G2', padding: { top: 5, right: 5, bottom: 5, left: 5 } },
      ],
    });
    const m = tree(g);
    expect(validateLayout(g, m)).toEqual([]);
    const [g1, g2] = [m.groups.get('G1')!, m.groups.get('G2')!];
    // One node gap between G1's bottom and G2's top.
    expect(g2.y - g2.height / 2 - (g1.y + g1.height / 2)).toBe(10);
  });

  it('reserves room across the flow for an edge label, so it clears the next subtree', () => {
    const g = graph(
      [
        ['r', 40, 20],
        ['p', 40, 20],
        ['a', 40, 20],
        ['s', 300, 20],
        ['x', 40, 20],
      ],
      ['r>p', 'p>a', 'p>s', 'a>x']
    );
    g.edges[3]!.label = { width: 40, height: 60 };
    expect(validateLayout(g, tree(g))).toEqual([]);
  });
});

// D285: a group gets its content's bounds plus padding, and placement ignores groups. When the
// members are not next to each other in the tree (on both sides of the root, or with a
// non-member between them), the box encloses non-members. No M4 diagram sends groups; GAPS.md
// records this for the maintainer. These specs pin the behaviour; the overlap check leaves
// group/non-member overlaps out.
describe('tree: groups whose members are not next to each other (D285)', () => {
  it('encloses the root when the members sit on both sides of it', () => {
    const g = graph([], ['r>a', 'r>b'], {
      nodes: [
        { id: 'r', width: 40, height: 20 },
        { id: 'a', width: 40, height: 20, parent: 'G' },
        { id: 'b', width: 40, height: 20, parent: 'G' },
      ],
      groups: [{ id: 'G', padding: { top: 0, right: 0, bottom: 0, left: 0 } }],
    });
    const m = tree(g);
    const box = m.groups.get('G')!;
    const [r, a, b] = [at(m, 'r'), at(m, 'a'), at(m, 'b')];
    expect(box.width).toBe(Math.abs(a.x - b.x) + 40);
    expect(Math.abs(box.x - r.x)).toBeLessThan(box.width / 2);
    expect(validateLayout(g, m).filter((p) => !groupOverlap(g, p))).toEqual([]);
    expect(validateLayout(g, m)).toEqual(["'r' and 'G' overlap"]);
  });

  it('encloses a non-member between two members, and two such groups overlap', () => {
    const g = graph([], ['r>a', 'r>b', 'r>c'], {
      nodes: [
        { id: 'r', width: 40, height: 20 },
        { id: 'a', width: 40, height: 20, parent: 'A' },
        { id: 'b', width: 40, height: 20, parent: 'B' },
        { id: 'c', width: 40, height: 20, parent: 'A' },
      ],
      groups: [
        { id: 'A', padding: { top: 0, right: 0, bottom: 0, left: 0 } },
        { id: 'B', padding: { top: 0, right: 0, bottom: 0, left: 0 } },
      ],
    });
    const m = tree(g);
    expect(validateLayout(g, m).filter((p) => !groupOverlap(g, p))).toEqual([]);
    expect(validateLayout(g, m).some(groupOverlap.bind(null, g))).toBe(true);
  });
});
