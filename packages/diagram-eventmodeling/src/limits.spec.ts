import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { eventmodeling } from './plugin.ts';

/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  eventmodeling
    .parse(text, {
      preprocessed: preprocess(text),
      ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  eventmodeling.parse(text, {
    preprocessed: preprocess(text),
    limits: resolveLimits(undefined, limits),
  } as unknown as DiagramParseContext).diagnostics[0]?.message;

describe('eventmodeling parse limits (R-SEC-5, #698)', () => {
  const model =
    'eventmodeling\ntf 01 cmd A\ntf 02 evt B ->> 01\ntf 03 rmo C ->> 02\ntf 04 ui D ->> 03\n';

  it('counts the frames against maxNodes, and reports the cap once, at the first over it', () => {
    expect(limitErrors(model, { maxNodes: 4 })).toEqual([]);
    expect(limitErrors(model, { maxNodes: 2 })).toEqual([`NODE_LIMIT ${model.indexOf('tf 03')}`]);
    expect(message(model, { maxNodes: 2 })).toMatch(
      /more than 2 frames, the limit\. The limit is set by the page or app/
    );
  });

  it('counts the relations between frames against maxEdges', () => {
    expect(limitErrors(model, { maxEdges: 3 })).toEqual([]);
    expect(limitErrors(model, { maxEdges: 2 })).toEqual([`EDGE_LIMIT ${model.indexOf('->> 03')}`]);
    expect(message(model, { maxEdges: 2 })).toMatch(/more than 2 relations, the limit\./);
  });

  it("defaults to core's maxNodes, repeated frame ids counted (a frame id has three digits at most)", () => {
    const many =
      'eventmodeling\n' +
      Array.from({ length: 10_001 }, (_, i) => `tf ${i % 1000} evt E`).join('\n');
    const at = many.lastIndexOf('tf 0 evt E');
    expect(limitErrors(many).filter((e) => !e.startsWith('EVENTMODELING_'))).toEqual([
      `NODE_LIMIT ${at}`,
    ]);
  });
});
