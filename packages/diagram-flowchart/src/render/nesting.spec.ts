import { describe, expect, it } from 'vitest';
import { parseFlowchart } from '../index.ts';
import { nesting } from './nesting.ts';

const of = (src: string) => nesting(parseFlowchart(src).model, 'TB');

describe('nesting depth and flow direction', () => {
  it('puts every id at depth 0 in the diagram direction without subgraphs', () => {
    const n = of('flowchart LR\nA --> B');
    for (const id of ['A', 'B', 'A', 'unknown']) {
      expect(n.depthOf(id), id).toBe(0);
      expect(n.flowDir(id), id).toBe('TB');
    }
  });

  it('counts the clusters around an id and takes the nearest own direction, in any order', () => {
    const src = [
      'flowchart TB',
      'subgraph S1',
      '  direction LR',
      '  subgraph S2',
      '    subgraph S3',
      '      direction RL',
      '      C',
      '    end',
      '    B',
      '  end',
      '  A',
      'end',
      'D',
    ].join('\n');
    const want: Record<string, [number, string]> = {
      C: [3, 'RL'],
      S3: [2, 'LR'],
      B: [2, 'LR'],
      S2: [1, 'LR'],
      A: [1, 'LR'],
      S1: [0, 'TB'],
      D: [0, 'TB'],
    };
    // Leaf first and root first fill the memo differently; each id is asked twice.
    for (const order of [Object.keys(want), Object.keys(want).reverse()]) {
      const n = of(src);
      for (const id of [...order, ...order])
        expect([n.depthOf(id), n.flowDir(id)], id).toEqual(want[id]);
    }
  });
});
