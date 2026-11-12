import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { c4 } from './plugin.ts';

/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  c4
    .parse(text, {
      preprocessed: preprocess(text),
      ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  c4.parse(text, {
    preprocessed: preprocess(text),
    limits: resolveLimits(undefined, limits),
  } as unknown as DiagramParseContext).diagnostics[0]?.message;

/** `depth` boundaries, each in the one before, and a system in the last. */
const nested = (depth: number): string =>
  'C4Context\n' +
  Array.from({ length: depth }, (_, i) => `Boundary(b${i}, "B${i}") {\n`).join('') +
  'System(leaf, "Leaf")\n' +
  '}\n'.repeat(depth);

describe('c4 parse limits (R-SEC-5, #721)', () => {
  const diagram =
    'C4Context\nPerson(a, "A")\nSystem(b, "B")\nBoundary(x, "X") {\n  System(c, "C")\n}\n' +
    'Rel(a, b, "uses")\nRel(b, c, "calls")\nRel(a, c, "reads")\n';

  it('counts elements and boundaries against maxNodes, reported once, at the first over it', () => {
    expect(limitErrors(diagram, { maxNodes: 4 })).toEqual([]);
    expect(limitErrors(diagram, { maxNodes: 2 })).toEqual([
      `NODE_LIMIT ${diagram.indexOf('Boundary(x')}`,
    ]);
    expect(message(diagram, { maxNodes: 2 })).toMatch(
      /more than 2 elements and boundaries, the limit\. The limit is set by the page or app/
    );
  });

  it('counts an element once, however often its alias is declared again', () => {
    const again = 'C4Context\nPerson(a, "A")\nPerson(a, "A2")\nPerson(a, "A3")\nSystem(b, "B")\n';
    expect(limitErrors(again, { maxNodes: 2 })).toEqual([]);
    expect(limitErrors(again, { maxNodes: 1 })).toEqual([`NODE_LIMIT ${again.indexOf('System')}`]);
  });

  it('counts the relations against maxEdges', () => {
    expect(limitErrors(diagram, { maxEdges: 3 })).toEqual([]);
    expect(limitErrors(diagram, { maxEdges: 1 })).toEqual([
      `EDGE_LIMIT ${diagram.indexOf('Rel(b, c')}`,
    ]);
    expect(message(diagram, { maxEdges: 1 })).toMatch(/more than 1 relations, the limit\./);
  });

  it('caps how deep an element or boundary may sit in boundaries, reported once', () => {
    const deep = nested(4);
    expect(limitErrors(deep, { maxDepth: 4 })).toEqual([]);
    expect(limitErrors(deep, { maxDepth: 2 })).toEqual([
      `DEPTH_LIMIT ${deep.indexOf('Boundary(b3')}`,
    ]);
    expect(message(deep, { maxDepth: 2 })).toMatch(/nested 3 deep here, over the limit of 2\./);
  });

  it("defaults to core's maxNodes, maxEdges and maxDepth", () => {
    const many =
      'C4Context\n' + Array.from({ length: 10_001 }, (_, i) => `System(s${i},"S")`).join('\n');
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('System(s10000,')}`]);
    const edges =
      'C4Context\n' + Array.from({ length: 5_001 }, (_, i) => `Rel(a${i},b,"r")`).join('\n');
    expect(limitErrors(edges).filter((e) => e.startsWith('EDGE_LIMIT'))).toEqual([
      `EDGE_LIMIT ${edges.indexOf('Rel(a5000,')}`,
    ]);
    expect(limitErrors(nested(100))).toEqual([]);
    const deep = nested(101);
    expect(limitErrors(deep)).toEqual([`DEPTH_LIMIT ${deep.indexOf('System(leaf')}`]);
  });
});
