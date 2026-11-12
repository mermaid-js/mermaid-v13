import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { gitGraph } from './plugin.ts';

/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  gitGraph
    .parse(text, {
      preprocessed: preprocess(text),
      config: {},
      ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  gitGraph.parse(text, {
    preprocessed: preprocess(text),
    config: {},
    limits: resolveLimits(undefined, limits),
  } as unknown as DiagramParseContext).diagnostics[0]?.message;

describe('gitGraph parse limits (R-SEC-5, #721)', () => {
  const graph =
    'gitGraph\n  commit id: "a"\n  branch dev\n  commit id: "b"\n  checkout main\n  merge dev\n  cherry-pick id: "b"\n';

  it('counts commits and branches, the main branch included, against maxNodes', () => {
    // main, a, dev, b, the merge: five.
    const merged = graph.slice(0, graph.indexOf('  cherry-pick'));
    expect(limitErrors(merged, { maxNodes: 5 })).toEqual([]);
    expect(limitErrors(merged, { maxNodes: 4 })).toEqual([
      `NODE_LIMIT ${merged.indexOf('merge dev')}`,
    ]);
    expect(limitErrors(merged, { maxNodes: 2 })).toEqual([`NODE_LIMIT ${merged.indexOf('dev')}`]);
    // A commit with an `id:` is reported at the id, one without at its keyword.
    expect(limitErrors(merged, { maxNodes: 1 })).toEqual([`NODE_LIMIT ${merged.indexOf('"a"')}`]);
    expect(message(merged, { maxNodes: 4 })).toBe(
      'The diagram has more than 4 commits and branches, the limit. The limit is set by the page or app that renders the diagram.'
    );
  });

  it('reports the cap once, however many follow', () => {
    const many = 'gitGraph\n' + '  commit\n'.repeat(9);
    expect(limitErrors(many, { maxNodes: 3 })).toHaveLength(1);
  });

  it("defaults to core's maxNodes", () => {
    const many =
      'gitGraph\n' + Array.from({ length: 10_000 }, (_, i) => `commit id: "c${i}"`).join('\n');
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('"c9999"')}`]);
    expect(limitErrors(many.slice(0, many.lastIndexOf('\n')))).toEqual([]);
  });
});
