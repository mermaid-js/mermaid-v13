import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { usecase } from './plugin.ts';

/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  usecase
    .parse(text, {
      preprocessed: preprocess(text),
      ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  usecase
    .parse(text, {
      preprocessed: preprocess(text),
      limits: resolveLimits(undefined, limits),
    } as unknown as DiagramParseContext)
    .diagnostics.find((d) => d.severity === 'error')?.message;

describe('usecase parse limits (R-SEC-5, #721)', () => {
  const diagram =
    'usecase-beta\nactor User\nsystemBoundary Shop\n  Pay\n  Browse\nend\n' +
    'json Data@{"a": 1}\nnote for Pay "n"\nUser --> Pay\nUser --> Browse\nUser --> Pay\nPay --> Data\n';

  it('counts actors, use cases, boundaries, JSON nodes and notes against maxNodes', () => {
    expect(limitErrors(diagram, { maxNodes: 6 })).toEqual([]);
    // An element is counted once, where it is first declared or named.
    expect(limitErrors(diagram, { maxNodes: 5 })).toEqual([
      `NODE_LIMIT ${diagram.indexOf('Pay "n"')}`,
    ]);
    expect(limitErrors(diagram, { maxNodes: 2 })).toEqual([
      `NODE_LIMIT ${diagram.indexOf('Pay\n')}`,
    ]);
    expect(message(diagram, { maxNodes: 2 })).toMatch(
      /more than 2 actors, use cases, boundaries, JSON nodes and notes, the limit\. The limit is set by the page or app/
    );
  });

  it('counts an element only a relationship names', () => {
    const implied = 'usecase-beta\nA --> B\nB --> C\n';
    expect(limitErrors(implied, { maxNodes: 3 })).toEqual([]);
    expect(limitErrors(implied, { maxNodes: 2 })).toEqual([
      `NODE_LIMIT ${implied.lastIndexOf('C')}`,
    ]);
  });

  it('counts the relationships against maxEdges, and reports the cap once', () => {
    expect(limitErrors(diagram, { maxEdges: 4 })).toEqual([]);
    expect(limitErrors(diagram, { maxEdges: 2 })).toEqual([
      `EDGE_LIMIT ${diagram.indexOf('User --> Pay\nPay')}`,
    ]);
    expect(message(diagram, { maxEdges: 2 })).toMatch(/more than 2 relationships, the limit\./);
  });

  it("defaults to core's maxNodes and maxEdges", () => {
    const nodes = 'usecase-beta\n' + Array.from({ length: 10_001 }, (_, i) => `u${i}`).join('\n');
    expect(limitErrors(nodes)).toEqual([`NODE_LIMIT ${nodes.indexOf('u10000')}`]);
    const edges = 'usecase-beta\n' + 'A --> B\n'.repeat(5_001);
    expect(limitErrors(edges)).toEqual([`EDGE_LIMIT ${8 * 5_000 + 'usecase-beta\n'.length}`]);
  });
});
