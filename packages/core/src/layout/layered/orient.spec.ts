// #1215 (D717): cycle breaking seeds its search from the sources, in declaration order, so the
// node declared first does not end up on top when it sits in a cycle.
import { describe, expect, it } from 'vitest';
import type { LayoutEdge, LayoutGraph, LayoutModel, LayoutNode } from '../types.ts';
import { layered } from './index.ts';

const SPACING = { node: 50, rank: 50, edge: 20 };
const PAD = { top: 8, right: 8, bottom: 8, left: 8 };

const node = (id: string, width = 80, parent?: string): LayoutNode => ({
  id,
  width,
  height: 40,
  ...(parent ? { parent } : {}),
});

const edge = (source: string, target: string, label?: string): LayoutEdge => ({
  id: `${source}->${target}`,
  source,
  target,
  minLen: 1,
  ...(label ? { label: { width: 9 * label.length + 12, height: 24 } } : {}),
});

const graph = (nodes: LayoutNode[], edges: LayoutEdge[], groups: string[] = []): LayoutGraph => ({
  direction: 'TB',
  nodes,
  edges,
  groups: groups.map((id) => ({ id, padding: PAD, title: { width: 80, height: 24 } })),
  spacing: SPACING,
  diagramPadding: 8,
  headRoom: 8,
});

// The #1215 repro: `state check <<choice>>` declared before `[*] --> Idle`.
const repro = (checkWidth: number, parent?: string): LayoutGraph =>
  graph(
    [
      node('check', checkWidth, parent),
      node('start', 14, parent),
      node('Idle', 80, parent),
      node('Done', 80, parent),
    ],
    [
      edge('start', 'Idle'),
      edge('Idle', 'check', 'request'),
      edge('check', 'Done', 'valid'),
      edge('check', 'Idle', 'invalid'),
    ],
    parent ? [parent] : []
  );

const top = (m: LayoutModel, id: string): number => m.nodes.get(id)!.y;

const expectTopDown = (m: LayoutModel, ids: string[]): void => {
  for (let i = 1; i < ids.length; i++)
    expect(top(m, ids[i - 1]!), `${ids[i - 1]} above ${ids[i]}`).toBeLessThan(top(m, ids[i]!));
};

describe('layered: cycle breaking starts from the sources (#1215, D717)', () => {
  it('ranks a choice declared first below the state that leads into it', () => {
    expectTopDown(layered(repro(28)), ['start', 'Idle', 'check', 'Done']);
  });

  it('ranks a described state declared first below the state that leads into it', () => {
    expectTopDown(layered(repro(110)), ['start', 'Idle', 'check', 'Done']);
  });

  it('does the same inside a composite state', () => {
    expectTopDown(layered(repro(28, 'Outer')), ['start', 'Idle', 'check', 'Done']);
  });

  // Composite states are declared before the transitions; the start's edge is written first.
  it('takes the sources in the order of their first edge, not of their declaration', () => {
    const m = layered(
      graph(
        [node('Side'), node('B'), node('C'), node('D'), node('start', 14)],
        [edge('start', 'B'), edge('B', 'C'), edge('C', 'D'), edge('D', 'B'), edge('Side', 'C')]
      )
    );
    expectTopDown(m, ['start', 'B', 'C', 'D']);
  });

  it('orients a cycle with no source from the node declared first, as before', () => {
    const m = layered(
      graph([node('A'), node('B'), node('C')], [edge('B', 'C'), edge('C', 'A'), edge('A', 'B')])
    );
    expectTopDown(m, ['A', 'B', 'C']);
  });
});
