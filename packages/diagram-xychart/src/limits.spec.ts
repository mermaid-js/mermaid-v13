import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { xychart } from './plugin.ts';

const parse = (text: string, limits?: Partial<Limits>) =>
  xychart.parse(text, {
    preprocessed: preprocess(text),
    config: {},
    ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
  } as unknown as DiagramParseContext);
/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  parse(text, limits)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  parse(text, limits).diagnostics[0]?.message;

describe('xychart parse limits (R-SEC-5, #721)', () => {
  const chart = 'xychart-beta\n  x-axis [a, b, c]\n  bar [11, 12, 13]\n  line [21, 22, 23]\n';

  it('counts the data points of every plot against maxNodes, and reports the cap once', () => {
    expect(limitErrors(chart, { maxNodes: 6 })).toEqual([]);
    expect(limitErrors(chart, { maxNodes: 4 })).toEqual([`NODE_LIMIT ${chart.indexOf('22')}`]);
    expect(limitErrors(chart, { maxNodes: 1 })).toEqual([`NODE_LIMIT ${chart.indexOf('12')}`]);
    expect(message(chart, { maxNodes: 4 })).toBe(
      'The diagram has more than 4 data points, the limit. The limit is set by the page or app that renders the diagram.'
    );
  });

  it('does not count the categories of an axis', () => {
    expect(
      limitErrors('xychart-beta\n  x-axis [a, b, c, d, e]\n  bar [1, 2]\n', { maxNodes: 2 })
    ).toEqual([]);
  });

  it("defaults to core's maxNodes", () => {
    const values = Array.from({ length: 10_001 }, (_, i) => (i === 10_000 ? '7777' : '1'));
    const many = `xychart-beta\n  bar [${values.join(', ')}]\n`;
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('7777')}`]);
  });
});
