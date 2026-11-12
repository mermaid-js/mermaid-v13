import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { quadrant } from './plugin.ts';

const parse = (text: string, limits?: Partial<Limits>) =>
  quadrant.parse(text, {
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

describe('quadrantChart parse limits (R-SEC-5, #721)', () => {
  const chart =
    'quadrantChart\n  A: [0.1, 0.2]\n  B: [0.3, 0.4]\n  C: [0.5, 0.6]\n  D: [0.7, 0.8]\n';

  it('counts the points against maxNodes, and reports the cap once, at the first over it', () => {
    expect(limitErrors(chart, { maxNodes: 4 })).toEqual([]);
    expect(limitErrors(chart, { maxNodes: 2 })).toEqual([`NODE_LIMIT ${chart.indexOf('C:')}`]);
    expect(message(chart, { maxNodes: 2 })).toBe(
      'The diagram has more than 2 points, the limit. The limit is set by the page or app that renders the diagram.'
    );
  });

  it("defaults to core's maxNodes", () => {
    const many =
      'quadrantChart\n' + Array.from({ length: 10_001 }, (_, i) => `p${i}: [0.5, 0.5]`).join('\n');
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('p10000:')}`]);
  });
});
