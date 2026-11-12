import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { venn } from './plugin.ts';

/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  venn
    .parse(text, {
      preprocessed: preprocess(text),
      ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  venn
    .parse(text, {
      preprocessed: preprocess(text),
      limits: resolveLimits(undefined, limits),
    } as unknown as DiagramParseContext)
    .diagnostics.find((d) => d.severity === 'error')?.message;

describe('venn parse limits (R-SEC-5, #721)', () => {
  const chart = 'venn-beta\nset A\nset B\nunion A, B\ntext A, B t1\ntext A t2\n';

  it('counts sets, unions and text nodes against maxNodes, and reports the cap once', () => {
    expect(limitErrors(chart, { maxNodes: 5 })).toEqual([]);
    expect(limitErrors(chart, { maxNodes: 2 })).toEqual([`NODE_LIMIT ${chart.indexOf('union')}`]);
    expect(limitErrors(chart, { maxNodes: 3 })).toEqual([
      `NODE_LIMIT ${chart.indexOf('text A, B')}`,
    ]);
    expect(message(chart, { maxNodes: 2 })).toMatch(
      /more than 2 sets, unions and text nodes, the limit\. The limit is set by the page or app/
    );
  });

  it("defaults to core's maxNodes", () => {
    const many = 'venn-beta\n' + Array.from({ length: 10_001 }, (_, i) => `set s${i}`).join('\n');
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('set s10000')}`]);
  });
});
