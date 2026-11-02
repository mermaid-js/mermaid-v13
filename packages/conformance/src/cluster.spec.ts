import { describe, expect, it } from 'vitest';
import { clusterDivergences } from './index.ts';
import type { ObservedDivergence } from './index.ts';

const d = (id: string, kind: ObservedDivergence['kind'], detail: string): ObservedDivergence => ({
  id,
  adapter: 'flowchart',
  inputHash: 'sha256:0',
  kind,
  detail,
});

describe('clusterDivergences', () => {
  it('groups failures that share a cause, one cluster per issue', () => {
    const clusters = clusterDivergences([
      d('a.mmd', 'model', 'vertices[0].text, edges[3].labelType'),
      d('b.mmd', 'model', 'vertices[7].text, edges[1].labelType'),
      d('c.mmd', 'accept', 'Parse error on line 3:\n...\nExpecting SEMI, got NODE_STRING'),
      d('d.mmd', 'accept', 'Parse error on line 12:\n..x\nExpecting SEMI, got NODE_STRING'),
      d('e.mmd', 'reject', 'Unexpected "@" at 2:4'),
    ]);
    expect(clusters.map((c) => [c.title, c.ids])).toEqual([
      [
        'Oracle divergence (flowchart, model): vertices[].text, edges[].labelType',
        ['a.mmd', 'b.mmd'],
      ],
      [
        'Oracle divergence (flowchart, accept): Expecting SEMI, got NODE_STRING',
        ['c.mmd', 'd.mmd'],
      ],
      ['Oracle divergence (flowchart, reject): Unexpected "@" at N:N', ['e.mmd']],
    ]);
  });
});
