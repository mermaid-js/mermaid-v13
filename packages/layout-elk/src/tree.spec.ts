import { describe, expect, it } from 'vitest';
import { ROOT, findCommonAncestor, orderNestedEdgeEnds, type Tree } from './tree.ts';

/** A parent lookup from `child: parent` pairs, as the adapter builds it from `parent` ids. */
const tree = (parents: Record<string, string>): Tree => new Map(Object.entries(parents));

const edges = (...pairs: [string, string][]) =>
  pairs.map(([source, target]) => ({ source, target }));

// Ported from v12 develop's `find-common-ancestor.ts` (no spec of its own there).
describe('findCommonAncestor', () => {
  const t = tree({ a: 'G', b: 'G', G: 'H', c: 'H', d: 'K' });

  it('gives the innermost group holding both ends', () => {
    expect(findCommonAncestor('a', 'b', t)).toBe('G');
    expect(findCommonAncestor('a', 'c', t)).toBe('H');
  });

  it('gives the root when the ends share no group', () => {
    expect(findCommonAncestor('a', 'd', t)).toBe(ROOT);
    expect(findCommonAncestor('x', 'y', t)).toBe(ROOT);
  });

  it('gives a self edge’s parent', () => {
    expect(findCommonAncestor('a', 'a', t)).toBe('G');
    expect(findCommonAncestor('x', 'x', t)).toBe(ROOT);
  });

  it('gives the group itself for an edge between a group and something inside it', () => {
    expect(findCommonAncestor('H', 'a', t)).toBe('H');
    expect(findCommonAncestor('a', 'H', t)).toBe('H');
  });
});

// Ported from v12 develop's `__tests__/nestedEdgeOrder.spec.ts`, every case.
describe('orderNestedEdgeEnds', () => {
  it('moves an edge from inside a subgraph in front of the edge from its border', () => {
    // outer --> a, then da --> a with da nested in outer
    const order = orderNestedEdgeEnds(
      edges(['outer', 'a'], ['da', 'a']),
      tree({ da: 'inner', inner: 'middle', middle: 'outer' })
    );
    expect(order).toEqual([1, 0]);
  });

  it('moves an edge into a subgraph member in front of the edge into its border', () => {
    const order = orderNestedEdgeEnds(edges(['a', 'outer'], ['a', 'da']), tree({ da: 'outer' }));
    expect(order).toEqual([1, 0]);
  });

  it('applies to a feedback edge as ELK is given it, reversed', () => {
    // three --> two, then two --> c2 with c2 inside three, handed to ELK as c2 -> two
    const order = orderNestedEdgeEnds(
      edges(['three', 'two'], ['c2', 'two']),
      tree({ b1: 'two', c2: 'three' })
    );
    expect(order).toEqual([1, 0]);
  });

  it('keeps the order when the inner edge is already declared first', () => {
    const order = orderNestedEdgeEnds(edges(['da', 'a'], ['outer', 'a']), tree({ da: 'outer' }));
    expect(order).toEqual([0, 1]);
  });

  it('keeps the order of edges whose other ends differ', () => {
    const order = orderNestedEdgeEnds(
      edges(['outer', 'a'], ['da', 'b'], ['x', 'outer']),
      tree({ da: 'outer' })
    );
    expect(order).toEqual([0, 1, 2]);
  });

  it('keeps the order of edges from sibling subgraphs', () => {
    const order = orderNestedEdgeEnds(edges(['A', 't'], ['b1', 't']), tree({ a1: 'A', b1: 'B' }));
    expect(order).toEqual([0, 1]);
  });

  it('moves only past the edges declared before it', () => {
    const order = orderNestedEdgeEnds(
      edges(['x', 'y'], ['S', 't'], ['x', 'z'], ['s1', 't'], ['S', 'u']),
      tree({ s1: 'S' })
    );
    expect(order).toEqual([0, 3, 1, 2, 4]);
  });
});
