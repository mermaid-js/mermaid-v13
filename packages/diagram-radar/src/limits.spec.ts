import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { radar } from './plugin.ts';

/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  radar
    .parse(text, {
      preprocessed: preprocess(text),
      ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  radar.parse(text, {
    preprocessed: preprocess(text),
    limits: resolveLimits(undefined, limits),
  } as unknown as DiagramParseContext).diagnostics[0]?.message;

describe('radar parse limits (R-SEC-5, #698)', () => {
  const chart = 'radar-beta\naxis A, B, C\ncurve c{1,2,3}\ncurve d{1,2,3}\n';

  it('counts axes and curves against maxNodes, and reports the cap once, at the first over it', () => {
    expect(limitErrors(chart, { maxNodes: 5 })).toEqual([]);
    expect(limitErrors(chart, { maxNodes: 4 })).toEqual([`NODE_LIMIT ${chart.indexOf('d{')}`]);
    expect(limitErrors(chart, { maxNodes: 1 })).toEqual([`NODE_LIMIT ${chart.indexOf('B')}`]);
    expect(message(chart, { maxNodes: 4 })).toMatch(
      /more than 4 axes and curves, the limit\. The limit is set by the page or app/
    );
  });

  it("defaults to core's maxNodes", () => {
    const many = 'radar-beta\n' + Array.from({ length: 10_001 }, (_, i) => `axis a${i}`).join('\n');
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('a10000')}`]);
  });
});
