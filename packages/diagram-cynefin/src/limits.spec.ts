import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { cynefin } from './plugin.ts';

/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  cynefin
    .parse(text, {
      preprocessed: preprocess(text),
      ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  cynefin.parse(text, {
    preprocessed: preprocess(text),
    limits: resolveLimits(undefined, limits),
  } as unknown as DiagramParseContext).diagnostics[0]?.message;

describe('cynefin parse limits (R-SEC-5, #698)', () => {
  const map =
    'cynefin-beta\ncomplex\n"a"\n"b"\nclear\n"c"\ncomplex --> clear\nclear --> chaotic\nchaotic --> complex\n';

  it('counts the items against maxNodes, and reports the cap once, at the first over it', () => {
    expect(limitErrors(map, { maxNodes: 3 })).toEqual([]);
    expect(limitErrors(map, { maxNodes: 2 })).toEqual([`NODE_LIMIT ${map.indexOf('"c"')}`]);
    expect(message(map, { maxNodes: 2 })).toMatch(
      /more than 2 items, the limit\. The limit is set by the page or app/
    );
  });

  it('counts the transitions against maxEdges', () => {
    expect(limitErrors(map, { maxEdges: 3 })).toEqual([]);
    expect(limitErrors(map, { maxEdges: 2 })).toEqual([
      `EDGE_LIMIT ${map.indexOf('chaotic --> complex')}`,
    ]);
    expect(message(map, { maxEdges: 2 })).toMatch(/more than 2 transitions, the limit\./);
  });

  it("defaults to core's maxNodes", () => {
    const many =
      'cynefin-beta\ncomplex\n' + Array.from({ length: 10_001 }, (_, i) => `"i${i}"`).join('\n');
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('"i10000"')}`]);
  });
});
