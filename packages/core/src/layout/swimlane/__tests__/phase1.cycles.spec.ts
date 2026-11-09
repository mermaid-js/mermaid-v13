// Ported from v12 `swimlanes/__tests__/phase1.cycles.spec.ts` (c9b12739f), on graphs built from a
// `LayoutGraph` through the adapter.
import { describe, expect, it } from 'vitest';
import { isAcyclic } from '../phase0.helpers.ts';
import { removeCycles_DFS } from '../phase1.cycles.ts';
import { viewOf } from './graphs.ts';
// cspell:ignore Gansner

const mkGraph = (nodes: string[], edges: [string, string][]) =>
  viewOf({ nodes, edges }, { groups: false });

describe('Phase 1 — Cycle Removal (DFS)', () => {
  it('No cycles: returns same edges; reversed empty', () => {
    const { acyclic, reversed } = removeCycles_DFS(
      mkGraph(
        ['A', 'B', 'C'],
        [
          ['A', 'B'],
          ['B', 'C'],
        ]
      )
    );
    expect(isAcyclic(acyclic)).toBe(true);
    expect(reversed.length).toBe(0);
    expect(acyclic.edges.map((e) => `${e.src}->${e.dst}`)).toEqual(['A->B', 'B->C']);
  });

  it('Single back edge is reversed', () => {
    const { acyclic, reversed } = removeCycles_DFS(
      mkGraph(
        ['A', 'B', 'C'],
        [
          ['A', 'B'],
          ['B', 'C'],
          ['C', 'A'],
        ]
      )
    );
    expect(isAcyclic(acyclic)).toBe(true);
    expect(reversed.length).toBe(1);
    expect(acyclic.edges.some((e) => e.src === 'A' && e.dst === 'C')).toBe(true);
  });

  it('Two-node cycle A<->B: reverses exactly one edge', () => {
    const { acyclic, reversed } = removeCycles_DFS(
      mkGraph(
        ['A', 'B'],
        [
          ['A', 'B'],
          ['B', 'A'],
        ]
      )
    );
    expect(isAcyclic(acyclic)).toBe(true);
    expect(reversed.length).toBe(1);
    // Deterministic: DFS starting at A will reverse B->A
    expect(reversed[0]!.src).toBe('B');
    expect(reversed[0]!.dst).toBe('A');
  });

  it('Cycle in one component; DAG in another is untouched', () => {
    const { acyclic } = removeCycles_DFS(
      mkGraph(
        ['A', 'B', 'C', 'X', 'Y'],
        [
          ['A', 'B'],
          ['B', 'A'],
          ['X', 'Y'],
        ]
      )
    );
    expect(isAcyclic(acyclic)).toBe(true);
    const xy = acyclic.edges.find((e) => e.id === 'e2');
    expect(xy?.src).toBe('X');
    expect(xy?.dst).toBe('Y');
  });

  it('Dense small graph becomes acyclic', () => {
    const nodes = ['A', 'B', 'C', 'D'];
    const pairs: [string, string][] = [];
    for (const a of nodes) for (const b of nodes) if (a !== b) pairs.push([a, b]);
    expect(isAcyclic(removeCycles_DFS(mkGraph(nodes, pairs)).acyclic)).toBe(true);
  });

  it('Seeds the DFS from true sources, not alphabetical order (16-intake-cycle-lr)', () => {
    // dot (Gansner et al. 1993 §2.1) starts the search "from source or sink nodes when
    // available", which finds the natural back edge fix->task.
    const { acyclic, reversed } = removeCycles_DFS(
      mkGraph(
        ['start', 'task', 'fix', 'decision'],
        [
          ['start', 'task'],
          ['task', 'decision'],
          ['decision', 'fix'],
          ['fix', 'task'],
        ]
      )
    );
    expect(isAcyclic(acyclic)).toBe(true);
    expect(reversed.map((e) => `${e.src}->${e.dst}`)).toEqual(['fix->task']);
    const sources = acyclic.nodes.filter((v) => !acyclic.edges.some((e) => e.dst === v));
    expect(sources).toEqual(['start']);
  });

  it('Falls back to declaration order when no node has in-degree 0', () => {
    const g = mkGraph(
      ['B', 'A'],
      [
        ['B', 'A'],
        ['A', 'B'],
      ]
    );
    const { acyclic, reversed } = removeCycles_DFS(g);
    expect(isAcyclic(acyclic)).toBe(true);
    expect(reversed.map((e) => `${e.src}->${e.dst}`)).toEqual(['A->B']);
  });
});
