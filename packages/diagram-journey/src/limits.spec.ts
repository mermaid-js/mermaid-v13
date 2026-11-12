import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { journey } from './plugin.ts';

/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  journey
    .parse(text, {
      preprocessed: preprocess(text),
      ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  journey.parse(text, {
    preprocessed: preprocess(text),
    limits: resolveLimits(undefined, limits),
  } as unknown as DiagramParseContext).diagnostics[0]?.message;

describe('journey parse limits (R-SEC-5, #698)', () => {
  const trip = 'journey\nsection S\nA: 3: Me\nB: 3: Me\nsection T\nC: 3: Me\n';

  it('counts sections and tasks against maxNodes, and reports the cap once, at the first over it', () => {
    expect(limitErrors(trip, { maxNodes: 5 })).toEqual([]);
    expect(limitErrors(trip, { maxNodes: 3 })).toEqual([`NODE_LIMIT ${trip.indexOf('section T')}`]);
    expect(message(trip, { maxNodes: 3 })).toMatch(
      /more than 3 sections and tasks, the limit\. The limit is set by the page or app/
    );
  });

  it("defaults to core's maxNodes", () => {
    const many = 'journey\n' + Array.from({ length: 10_001 }, (_, i) => `t${i}: 3: Me`).join('\n');
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('t10000')}`]);
  });
});
