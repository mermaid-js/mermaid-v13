import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { timeline } from './plugin.ts';

/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  timeline
    .parse(text, {
      preprocessed: preprocess(text),
      config: {},
      ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  timeline.parse(text, {
    preprocessed: preprocess(text),
    config: {},
    limits: resolveLimits(undefined, limits),
  } as unknown as DiagramParseContext).diagnostics[0]?.message;

describe('timeline parse limits (R-SEC-5, #721)', () => {
  const chart = 'timeline\n  section A\n  2001 : one\n       : two\n  section B\n  2002 : three\n';

  it('counts sections, periods and events against maxNodes, and reports the cap once, at the first over it', () => {
    expect(limitErrors(chart, { maxNodes: 7 })).toEqual([]);
    expect(limitErrors(chart, { maxNodes: 4 })).toEqual([
      `NODE_LIMIT ${chart.indexOf('section B')}`,
    ]);
    expect(limitErrors(chart, { maxNodes: 2 })).toEqual([`NODE_LIMIT ${chart.indexOf(': one')}`]);
    expect(limitErrors(chart, { maxNodes: 1 })).toEqual([`NODE_LIMIT ${chart.indexOf('2001')}`]);
    expect(message(chart, { maxNodes: 4 })).toBe(
      'The diagram has more than 4 sections, periods and events, the limit. The limit is set by the page or app that renders the diagram.'
    );
  });

  it("defaults to core's maxNodes", () => {
    const many = 'timeline\n' + Array.from({ length: 10_001 }, (_, i) => `p${i}`).join('\n');
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('p10000')}`]);
  });
});
