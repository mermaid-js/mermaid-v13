import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { LIMIT_CODES, isLimitCode, resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { state } from './plugin.ts';

/** A parse through the plugin, with the integrator's `limits` when given. */
const parse = (text: string, limits?: Partial<Limits>) =>
  state.parse(text, {
    preprocessed: preprocess(text),
    ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
  } as unknown as DiagramParseContext);

/** The limit errors of a parse, as codes; `[]` when it renders. Any other error fails. */
const limitCodes = (text: string, limits?: Partial<Limits>): string[] => {
  const errors = parse(text, limits).diagnostics.filter((d) => d.severity === 'error');
  expect(errors.filter((d) => !isLimitCode(d.code))).toEqual([]);
  return errors.map((d) => d.code);
};

/**
 * Every cap from 0 to two past `count`: one `LIMIT` error under `count`, none from it on, so the
 * result never goes from `LIMIT` back to rendered as the cap grows (#747, #748).
 */
const sweep = (text: string, limit: 'maxNodes' | 'maxEdges', count: number): void => {
  for (let cap = 0; cap <= count + 2; cap++) {
    expect(limitCodes(text, { [limit]: cap }), `${limit}: ${cap}`).toEqual(
      cap < count ? [LIMIT_CODES[limit]] : []
    );
  }
};

/** The model's own count of states and transitions, which the caps count. */
const counts = (text: string): [number, number] => {
  const { model } = parse(text);
  return [model.states.length, model.transitions.length];
};

/** `states` states `s0`…, each joined to the next two: `2 × states` transitions. */
const ring = (states: number): string =>
  'stateDiagram-v2\n' +
  Array.from(
    { length: states },
    (_, i) => `  s${i} --> s${(i + 1) % states}\n  s${i} --> s${(i + 2) % states}`
  ).join('\n');

/** The sample of issue #747. */
const SAMPLE =
  'stateDiagram-v2\n' + Array.from({ length: 7 }, (_, i) => `  s${i} --> s${i + 1}`).join('\n');

describe('state parse limits (R-SEC-5, #721, #747, D608)', () => {
  it("fails the issue's sample at maxNodes 5 and maxEdges 5, and draws it at its exact counts", () => {
    expect(counts(SAMPLE)).toEqual([8, 7]);
    expect(limitCodes(SAMPLE, { maxNodes: 5 })).toEqual(['NODE_LIMIT']);
    expect(limitCodes(SAMPLE, { maxEdges: 5 })).toEqual(['EDGE_LIMIT']);
    expect(limitCodes(SAMPLE, { maxNodes: 8, maxEdges: 7 })).toEqual([]);
    sweep(SAMPLE, 'maxNodes', 8);
    sweep(SAMPLE, 'maxEdges', 7);
  });

  it('counts the 40 states and 80 transitions of the measured diagram', () => {
    const text = ring(40);
    expect(counts(text)).toEqual([40, 80]);
    expect(limitCodes(text, { maxNodes: 5 })).toEqual(['NODE_LIMIT']);
    expect(limitCodes(text, { maxEdges: 5 })).toEqual(['EDGE_LIMIT']);
    sweep(text, 'maxNodes', 40);
    sweep(text, 'maxEdges', 80);
  });

  it('reports the first state and transition over the cap, in core words', () => {
    const nodes = parse(SAMPLE, { maxNodes: 5 }).diagnostics[0]!;
    expect(nodes.message).toBe(
      'The diagram has more than 5 states, the limit. The limit is set by the page or app that renders the diagram.'
    );
    expect(SAMPLE.slice(nodes.range.start, nodes.range.end)).toBe('s5');
    const edges = parse(SAMPLE, { maxEdges: 5 }).diagnostics[0]!;
    expect(edges.message).toMatch(/^The diagram has more than 5 transitions, the limit\./);
    expect(SAMPLE.slice(edges.range.start, edges.range.end)).toBe('s5 --> s6');
  });

  it.each([
    ['a transition that makes both its ends', 'stateDiagram-v2\n  a --> b\n  c --> d', 4, 2],
    ['start and end dots', 'stateDiagram-v2\n  [*] --> a\n  a --> [*]', 3, 2],
    [
      'forks, joins and choices',
      'stateDiagram-v2\n  state f <<fork>>\n  state j <<join>>\n  state c <<choice>>\n' +
        '  [*] --> f\n  f --> a\n  f --> b\n  a --> j\n  b --> j\n  j --> c\n  c --> [*]',
      7,
      7,
    ],
    [
      'composite states and their own dots',
      'stateDiagram-v2\n  state C {\n    [*] --> a\n    a --> b\n    b --> [*]\n  }\n  [*] --> C',
      6,
      4,
    ],
    [
      'nested composites',
      'stateDiagram-v2\n  state A {\n    state B {\n      x --> y\n    }\n    B --> z\n  }',
      5,
      2,
    ],
    [
      'concurrency regions (the regions are not states)',
      'stateDiagram-v2\n  state C {\n    a --> b\n    --\n    c --> d\n  }',
      5,
      2,
    ],
    ['a state on its own and a state with a description', 'stateDiagram-v2\n  a\n  b : B', 2, 0],
    [
      'notes (which are neither)',
      'stateDiagram-v2\n  a --> b\n  note right of a : n\n  note left of b\n    m\n  end note',
      2,
      1,
    ],
    ['a repeated state and transition', 'stateDiagram-v2\n  a --> b\n  a --> b\n  b', 2, 2],
  ])('counts %s', (_name, text, nodes, edges) => {
    expect(counts(text)).toEqual([nodes, edges]);
    sweep(text, 'maxNodes', nodes);
    sweep(text, 'maxEdges', edges);
  });

  it("defaults to core's maxNodes and maxEdges", () => {
    const states = (n: number) =>
      'stateDiagram-v2\n' + Array.from({ length: n }, (_, i) => `  s${i}`).join('\n');
    expect(limitCodes(states(10_000))).toEqual([]);
    expect(limitCodes(states(10_001))).toEqual(['NODE_LIMIT']);
    const transitions = (n: number) => 'stateDiagram-v2\n' + '  a --> b\n'.repeat(n);
    expect(limitCodes(transitions(5_000))).toEqual([]);
    expect(limitCodes(transitions(5_001))).toEqual(['EDGE_LIMIT']);
  });
});
