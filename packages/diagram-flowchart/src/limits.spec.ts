import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '@mermaid-js/core/limits';
import { parseFlowchart } from './index.ts';

const repeat = (count: number, line: (i: number) => string): string =>
  Array.from({ length: count }, (_, i) => line(i)).join('');
const chain = (count: number): string =>
  'flowchart LR\n' + repeat(count, (i) => `N${i} --> N${i + 1}\n`);
const nested = (depth: number): string =>
  'flowchart TD\n' + repeat(depth, (i) => `subgraph s${i}\n`) + 'A --> B\n' + 'end\n'.repeat(depth);
const ids = (count: number, prefix: string): string =>
  Array.from({ length: count }, (_, i) => prefix + i).join(' & ');
const codes = (src: string, options?: Parameters<typeof parseFlowchart>[1]): string[] =>
  parseFlowchart(src, options)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);

describe('flowchart parse limits', () => {
  it('defaults to 5,000 edges (v12 stopped at 500)', () => {
    expect(codes(chain(5000))).toEqual([]);
    expect(codes(chain(5001))).toEqual(['EDGE_LIMIT']);
  });

  it('refuses a cross product over the limit with one diagnostic, before making the edges', () => {
    const started = Date.now();
    const r = parseFlowchart(`flowchart LR\n${ids(2000, 'a')} --> ${ids(2000, 'b')}\n`);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['EDGE_LIMIT']);
    expect(r.model.edges.length).toBeLessThanOrEqual(DEFAULT_LIMITS.maxEdges);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('caps the node count', () => {
    const src = 'flowchart TD\n' + repeat(11, (i) => `n${i}\n`);
    expect(codes(src, { maxNodes: 11 })).toEqual([]);
    expect(codes(src, { maxNodes: 10 })).toEqual(['NODE_LIMIT']);
  });

  it('caps subgraph nesting at 100 by default', () => {
    expect(codes(nested(100))).toEqual([]);
    const r = parseFlowchart(nested(101));
    expect(r.diagnostics.map((d) => d.code)).toEqual(['DEPTH_LIMIT']);
    expect(r.diagnostics[0]?.message).toMatch(/nested 101 deep.*limit of 100/);
    expect(codes(nested(1000), { maxDepth: 1000 })).toEqual([]);
  });
});
