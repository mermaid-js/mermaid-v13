import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { architecture } from './plugin.ts';

/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  architecture
    .parse(text, {
      preprocessed: preprocess(text),
      ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  architecture.parse(text, {
    preprocessed: preprocess(text),
    limits: resolveLimits(undefined, limits),
  } as unknown as DiagramParseContext).diagnostics[0]?.message;

/** `depth` groups, each in the one before, and a service in the last. */
const nested = (depth: number): string =>
  'architecture-beta\n' +
  Array.from({ length: depth }, (_, i) => `group g${i}${i ? ` in g${i - 1}` : ''}\n`).join('') +
  `service leaf(server) in g${depth - 1}\n`;

describe('architecture parse limits (R-SEC-5, #721)', () => {
  const diagram =
    'architecture-beta\ngroup api\nservice db(database) in api\nservice web(server) in api\n' +
    'junction j in api\ndb:R -- L:web\nweb:R -- L:j\nj:T -- B:db\n';

  it('counts groups, services and junctions against maxNodes, reported once, at the first over it', () => {
    expect(limitErrors(diagram, { maxNodes: 4 })).toEqual([]);
    expect(limitErrors(diagram, { maxNodes: 2 })).toEqual([
      `NODE_LIMIT ${diagram.indexOf('service web')}`,
    ]);
    expect(message(diagram, { maxNodes: 2 })).toMatch(
      /more than 2 groups, services and junctions, the limit\. The limit is set by the page or app/
    );
  });

  it('counts the edges against maxEdges', () => {
    expect(limitErrors(diagram, { maxEdges: 3 })).toEqual([]);
    expect(limitErrors(diagram, { maxEdges: 1 })).toEqual([
      `EDGE_LIMIT ${diagram.indexOf('web:R')}`,
    ]);
    expect(message(diagram, { maxEdges: 1 })).toMatch(/more than 1 edges, the limit\./);
  });

  it('caps how deep a group, service or junction may sit under a top-level group, reported once', () => {
    const deep = nested(4);
    expect(limitErrors(deep, { maxDepth: 4 })).toEqual([]);
    expect(limitErrors(deep, { maxDepth: 2 })).toEqual([`DEPTH_LIMIT ${deep.indexOf('group g3')}`]);
    expect(message(deep, { maxDepth: 2 })).toMatch(/nested 3 deep here, over the limit of 2\./);
  });

  it("defaults to core's maxNodes, maxEdges and maxDepth", () => {
    const many =
      'architecture-beta\n' + Array.from({ length: 10_001 }, (_, i) => `service s${i}`).join('\n');
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('service s10000')}`]);
    const edges =
      'architecture-beta\nservice a\nservice b\n' +
      Array.from({ length: 5_001 }, (_, i) => `a:R -- L:b %% ${i}`).join('\n');
    expect(limitErrors(edges)).toEqual([`EDGE_LIMIT ${edges.indexOf('a:R -- L:b %% 5000')}`]);
    expect(limitErrors(nested(100))).toEqual([]);
    const deep = nested(101);
    expect(limitErrors(deep)).toEqual([`DEPTH_LIMIT ${deep.indexOf('service leaf')}`]);
  });
});
