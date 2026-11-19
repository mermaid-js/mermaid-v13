import { describe, expect, it } from 'vitest';
import { checkGraph, checkGroupTitle, checkLabelSizes, checkNodeSpan, finite } from './check.ts';
import { compass } from './compass/index.ts';
import { layered } from './layered/index.ts';
import { swimlane } from './swimlane/index.ts';
import { tree } from './tree/index.ts';
import type { LayoutEdge, LayoutEngine, LayoutGraph, LayoutGroup } from './types.ts';

const edge = (id: string, source: string, target: string): LayoutEdge => ({
  id,
  source,
  target,
  minLen: 1,
});

const graph = (edges: LayoutEdge[]): LayoutGraph => ({
  direction: 'TB',
  nodes: [
    { id: 'a', width: 10, height: 10 },
    { id: 'b', width: 10, height: 10 },
  ],
  edges,
  groups: [],
  spacing: { node: 10, rank: 10, edge: 10 },
});

describe('finite', () => {
  it('accepts 0 and positive numbers', () => {
    expect(() => finite(0, 'x')).not.toThrow();
    expect(() => finite(3.5, 'x')).not.toThrow();
  });

  it.each([-1, NaN, Infinity])('rejects %s with the message the engines share', (v) => {
    expect(() => finite(v, 'width of node n')).toThrow(
      new RangeError(`layout: width of node n must be a finite number >= 0, got ${v}`)
    );
  });
});

describe('finite', () => {
  it('accepts 0 and positive numbers', () => {
    expect(() => finite(0, 'x')).not.toThrow();
    expect(() => finite(3.5, 'x')).not.toThrow();
  });

  it.each([-1, NaN, Infinity])('rejects %s with the message the engines share', (v) => {
    expect(() => finite(v, 'width of node n')).toThrow(
      new RangeError(`layout: width of node n must be a finite number >= 0, got ${v}`)
    );
  });
});

describe('checkGraph', () => {
  const ok = { top: 1, right: 1, bottom: 1, left: 1 };
  const group = (id: string, padding = ok): LayoutGroup => ({ id, padding });

  it('accepts a graph that is in order', () => {
    expect(() => checkGraph(graph([edge('e', 'a', 'b')]))).not.toThrow();
  });

  it('rejects a repeated node id', () => {
    const g = graph([]);
    g.nodes.push({ id: 'a', width: 1, height: 1 });
    expect(() => checkGraph(g)).toThrow(new Error("layout: duplicate node id 'a'"));
  });

  it('rejects a group that takes a node id, naming what it is', () => {
    const g = { ...graph([]), groups: [group('a')] };
    expect(() => checkGraph(g)).toThrow(new Error("layout: duplicate group id 'a'"));
  });

  it('rejects a node width or height that is not a number of at least 0', () => {
    const g = graph([]);
    g.nodes[0] = { id: 'w', width: -1, height: 1 };
    expect(() => checkGraph(g)).toThrow(
      new RangeError("layout: width of node 'w' must be a finite number >= 0, got -1")
    );
    g.nodes[0] = { id: 'h', width: 1, height: NaN };
    expect(() => checkGraph(g)).toThrow(
      new RangeError("layout: height of node 'h' must be a finite number >= 0, got NaN")
    );
  });

  it.each(['top', 'right', 'bottom', 'left'] as const)(
    'rejects a group %s padding below 0',
    (side) => {
      const g = { ...graph([]), groups: [group('g', { ...ok, [side]: -1 })] };
      expect(() => checkGraph(g)).toThrow(
        new RangeError("layout: padding of group 'g' must be a finite number >= 0, got -1")
      );
    }
  );

  it('rejects a repeated edge id', () => {
    expect(() => checkGraph(graph([edge('e', 'a', 'b'), edge('e', 'b', 'a')]))).toThrow(
      new Error("layout: duplicate edge id 'e'")
    );
  });

  it('rejects an unknown source', () => {
    expect(() => checkGraph(graph([edge('e', 'x', 'b')]))).toThrow(
      new Error("layout: edge 'e' has unknown source 'x'")
    );
  });

  it('rejects an unknown target', () => {
    expect(() => checkGraph(graph([edge('e', 'a', 'x')]))).toThrow(
      new Error("layout: edge 'e' has unknown target 'x'")
    );
  });

  it('accepts an edge from a group to a node', () => {
    const g = { ...graph([edge('e', 'g', 'a')]), groups: [group('g')] };
    expect(() => checkGraph(g)).not.toThrow();
  });

  it.each(['node', 'rank'] as const)('rejects spacing.%s below 0', (key) => {
    const g = graph([]);
    g.spacing[key] = -1;
    expect(() => checkGraph(g)).toThrow(
      new RangeError(`layout: spacing.${key} must be a finite number >= 0, got -1`)
    );
  });

  it('rejects a diagramPadding below 0', () => {
    expect(() => checkGraph({ ...graph([]), diagramPadding: -1 })).toThrow(
      new RangeError('layout: diagramPadding must be a finite number >= 0, got -1')
    );
  });

  it('checks spacing.edge and headRoom only for an engine that routes edges', () => {
    const g = { ...graph([]), headRoom: -1 };
    g.spacing.edge = -1;
    expect(() => checkGraph(g)).not.toThrow();
    expect(() => checkGraph(g, { routed: true })).toThrow(
      new RangeError('layout: spacing.edge must be a finite number >= 0, got -1')
    );
    g.spacing.edge = 1;
    expect(() => checkGraph(g, { routed: true })).toThrow(
      new RangeError('layout: headRoom must be a finite number >= 0, got -1')
    );
  });

  it('runs each extra check on its item after the shared ones, and reports the first fault', () => {
    const seen: string[] = [];
    const g = { ...graph([edge('e1', 'a', 'b'), edge('e2', 'x', 'b')]), groups: [group('g')] };
    expect(() =>
      checkGraph(g, {
        node: (n) => seen.push(`node ${n.id}`),
        group: (x) => seen.push(`group ${x.id}`),
        edge: (e) => seen.push(`edge ${e.id}`),
      })
    ).toThrow("edge 'e2' has unknown source");
    expect(seen).toEqual(['node a', 'node b', 'group g', 'edge e1']);
  });
});

describe('checkNodeSpan', () => {
  const n = { id: 'n', width: 1, height: 1 };

  it('accepts a node with neither field', () => {
    expect(() => checkNodeSpan(n)).not.toThrow();
    expect(() => checkNodeSpan({ ...n, span: 0, anchorY: 0 })).not.toThrow();
  });

  it('rejects a span or anchorY that is not a number of at least 0', () => {
    expect(() => checkNodeSpan({ ...n, span: -1 })).toThrow(
      new RangeError("layout: span of node 'n' must be a finite number >= 0, got -1")
    );
    expect(() => checkNodeSpan({ ...n, anchorY: NaN })).toThrow(
      new RangeError("layout: anchorY of node 'n' must be a finite number >= 0, got NaN")
    );
  });
});

describe('checkGroupTitle', () => {
  const group = (title?: { width: number; height: number }): LayoutGroup => ({
    id: 'g',
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    ...(title ? { title } : {}),
  });

  it('accepts a group with no title', () => {
    expect(() => checkGroupTitle(group())).not.toThrow();
  });

  it('rejects a width or height that is not a number of at least 0', () => {
    expect(() => checkGroupTitle(group({ width: -1, height: 1 }))).toThrow(
      new RangeError("layout: title width of group 'g' must be a finite number >= 0, got -1")
    );
    expect(() => checkGroupTitle(group({ width: 1, height: NaN }))).toThrow(
      new RangeError("layout: title height of group 'g' must be a finite number >= 0, got NaN")
    );
  });
});

describe('checkLabelSizes', () => {
  it.each(['label', 'startLabel', 'endLabel'] as const)('checks %s', (key) => {
    const e = { ...edge('e', 'a', 'b'), [key]: { width: 1, height: 1 } };
    expect(() => checkLabelSizes(e)).not.toThrow();
    expect(() => checkLabelSizes({ ...e, [key]: { width: -1, height: 1 } })).toThrow(
      new RangeError("layout: label width of edge 'e' must be a finite number >= 0, got -1")
    );
    expect(() => checkLabelSizes({ ...e, [key]: { width: 1, height: NaN } })).toThrow(
      new RangeError("layout: label height of edge 'e' must be a finite number >= 0, got NaN")
    );
  });

  it('accepts an edge with no label', () => {
    expect(() => checkLabelSizes(edge('e', 'a', 'b'))).not.toThrow();
  });
});

const ENGINES: [string, LayoutEngine][] = [
  ['layered', layered],
  ['compass', compass],
  ['tree', tree],
  ['swimlane', swimlane],
];

describe.each(ENGINES)('%s input check', (_name, engine) => {
  it('rejects a repeated edge id', () => {
    expect(() => engine(graph([edge('e', 'a', 'b'), edge('e', 'b', 'a')]))).toThrow(
      new Error("layout: duplicate edge id 'e'")
    );
  });

  it('rejects an unknown source', () => {
    expect(() => engine(graph([edge('e', 'x', 'b')]))).toThrow(
      new Error("layout: edge 'e' has unknown source 'x'")
    );
  });

  it('rejects an unknown target', () => {
    expect(() => engine(graph([edge('e', 'a', 'x')]))).toThrow(
      new Error("layout: edge 'e' has unknown target 'x'")
    );
  });

  it('rejects a repeated node id', () => {
    const g = graph([]);
    g.nodes.push({ id: 'a', width: 1, height: 1 });
    expect(() => engine(g)).toThrow(new Error("layout: duplicate node id 'a'"));
  });

  it('rejects a label with a size that is not a number', () => {
    const e = { ...edge('e', 'a', 'b'), label: { width: NaN, height: 1 } };
    expect(() => engine(graph([e]))).toThrow(/label.*edge 'e'.*must be a finite number/);
  });
});
