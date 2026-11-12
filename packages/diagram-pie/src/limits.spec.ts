import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { pie } from './plugin.ts';

/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  pie
    .parse(text, {
      preprocessed: preprocess(text),
      ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  pie.parse(text, {
    preprocessed: preprocess(text),
    limits: resolveLimits(undefined, limits),
  } as unknown as DiagramParseContext).diagnostics[0]?.message;

describe('pie parse limits (R-SEC-5, #698)', () => {
  const chart = 'pie\n"a" : 1\n"b" : 2\n"c" : 3\n"d" : 4\n';

  it('counts the sections against maxNodes, and reports the cap once, at the first over it', () => {
    expect(limitErrors(chart, { maxNodes: 4 })).toEqual([]);
    expect(limitErrors(chart, { maxNodes: 2 })).toEqual([`NODE_LIMIT ${chart.indexOf('"c"')}`]);
    expect(message(chart, { maxNodes: 2 })).toMatch(
      /more than 2 sections, the limit\. The limit is set by the page or app/
    );
  });

  it("defaults to core's maxNodes", () => {
    const many = 'pie\n' + Array.from({ length: 10_001 }, (_, i) => `"s${i}" : 1`).join('\n');
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('"s10000"')}`]);
  });
});
