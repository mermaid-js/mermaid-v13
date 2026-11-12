import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { treemap } from './plugin.ts';

/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  treemap
    .parse(text, {
      preprocessed: preprocess(text),
      ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  treemap.parse(text, {
    preprocessed: preprocess(text),
    limits: resolveLimits(undefined, limits),
  } as unknown as DiagramParseContext).diagnostics[0]?.message;

const nested = (depth: number): string =>
  'treemap-beta\n' +
  Array.from({ length: depth }, (_, i) => `${' '.repeat(i)}"s${i}"\n`).join('') +
  `${' '.repeat(depth)}"leaf": 1\n`;

describe('treemap parse limits (R-SEC-5, #698)', () => {
  const map = 'treemap-beta\n"A"\n  "B": 1\n  "C": 2\n"D"\n  "E": 3\n';

  it('counts sections and leaves against maxNodes, and reports the cap once, at the first over it', () => {
    expect(limitErrors(map, { maxNodes: 5 })).toEqual([]);
    expect(limitErrors(map, { maxNodes: 3 })).toEqual([`NODE_LIMIT ${map.indexOf('"D"')}`]);
    expect(message(map, { maxNodes: 3 })).toMatch(
      /more than 3 sections and leaves, the limit\. The limit is set by the page or app/
    );
  });

  it('caps how deep a row may sit under a top section, reported once', () => {
    const deep = nested(4);
    expect(limitErrors(deep, { maxDepth: 4 })).toEqual([]);
    expect(limitErrors(deep, { maxDepth: 2 })).toEqual([`DEPTH_LIMIT ${deep.indexOf('"s3"')}`]);
    expect(message(deep, { maxDepth: 2 })).toMatch(/nested 3 deep here, over the limit of 2\./);
  });

  it("defaults to core's maxNodes and maxDepth", () => {
    const many =
      'treemap-beta\n' + Array.from({ length: 10_001 }, (_, i) => `"l${i}": 1`).join('\n');
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('"l10000"')}`]);
    expect(limitErrors(nested(100))).toEqual([]);
    const deep = nested(101);
    expect(limitErrors(deep)).toEqual([`DEPTH_LIMIT ${deep.indexOf('"leaf"')}`]);
  });
});
