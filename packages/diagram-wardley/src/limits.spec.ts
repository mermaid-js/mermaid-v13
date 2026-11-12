import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { wardley } from './plugin.ts';

/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  wardley
    .parse(text, {
      preprocessed: preprocess(text),
      ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  wardley.parse(text, {
    preprocessed: preprocess(text),
    limits: resolveLimits(undefined, limits),
  } as unknown as DiagramParseContext).diagnostics[0]?.message;

describe('wardley parse limits (R-SEC-5, #698)', () => {
  const map =
    'wardley-beta\nanchor U [0.9, 0.9]\ncomponent A [0.5, 0.5]\ncomponent B [0.4, 0.4]\n' +
    'pipeline B {\n  component C [0.3]\n  component D [0.6]\n}\nU -> A\nA -> B\nU -> B\n';

  it('counts anchors and components, a pipeline’s included, against maxNodes', () => {
    expect(limitErrors(map, { maxNodes: 5 })).toEqual([]);
    expect(limitErrors(map, { maxNodes: 2 })).toEqual([`NODE_LIMIT ${map.indexOf('component B')}`]);
    expect(limitErrors(map, { maxNodes: 4 })).toEqual([`NODE_LIMIT ${map.indexOf('component D')}`]);
    expect(message(map, { maxNodes: 2 })).toMatch(
      /more than 2 anchors and components, the limit\. The limit is set by the page or app/
    );
  });

  it('counts the links against maxEdges', () => {
    expect(limitErrors(map, { maxEdges: 3 })).toEqual([]);
    expect(limitErrors(map, { maxEdges: 2 })).toEqual([`EDGE_LIMIT ${map.indexOf('U -> B')}`]);
    expect(message(map, { maxEdges: 2 })).toMatch(/more than 2 links, the limit\./);
  });

  it("defaults to core's maxNodes", () => {
    const many =
      'wardley-beta\n' +
      Array.from({ length: 10_001 }, (_, i) => `component c${i} [0.5, 0.5]`).join('\n');
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('component c10000')}`]);
  });
});
