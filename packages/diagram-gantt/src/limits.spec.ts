import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { gantt } from './plugin.ts';

/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  gantt
    .parse(text, {
      preprocessed: preprocess(text),
      config: {},
      ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  gantt.parse(text, {
    preprocessed: preprocess(text),
    config: {},
    limits: resolveLimits(undefined, limits),
  } as unknown as DiagramParseContext).diagnostics[0]?.message;

describe('gantt parse limits (R-SEC-5, #721)', () => {
  const chart =
    'gantt\n  dateFormat YYYY-MM-DD\n  section A\n  t1 : 2024-01-01, 1d\n  t2 : 1d\n  section B\n  t3 : 1d\n';

  it('counts sections and tasks against maxNodes, and reports the cap once, at the first over it', () => {
    expect(limitErrors(chart, { maxNodes: 5 })).toEqual([]);
    expect(limitErrors(chart, { maxNodes: 3 })).toEqual([
      `NODE_LIMIT ${chart.indexOf('section B')}`,
    ]);
    expect(limitErrors(chart, { maxNodes: 1 })).toEqual([`NODE_LIMIT ${chart.indexOf('t1')}`]);
    expect(message(chart, { maxNodes: 3 })).toBe(
      'The diagram has more than 3 sections and tasks, the limit. The limit is set by the page or app that renders the diagram.'
    );
  });

  it("defaults to core's maxNodes", () => {
    const many = 'gantt\n' + Array.from({ length: 10_001 }, (_, i) => `x${i} : 1d`).join('\n');
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('x10000 ')}`]);
  });
});
