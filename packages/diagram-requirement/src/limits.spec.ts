import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import {
  LIMIT_CODES,
  LimitError,
  isLimitCode,
  resolveLimits,
  type Limits,
} from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { checkStyleCopies } from './limits.ts';
import { parseRequirement } from './parser/index.ts';
import { requirement } from './plugin.ts';

/**
 * The style-copy cap (D433, R-SEC-5) in gantt's shape (D542): the parse records the overflow,
 * and `checkStyleCopies` (which the layout calls first) throws core's `LimitError`, which the
 * pipeline turns into `MermaidError { code: 'LIMIT' }`. The `render()` assertion is T5's
 * (GAPS #587).
 */
describe('the style-copy cap', () => {
  it('ends in a LimitError naming the limit, its value and the count found', () => {
    const ids = Array.from({ length: 1001 }, () => 'a').join(',');
    const classes = Array.from({ length: 1000 }, () => 'c').join(',');
    const { model, diagnostics } = parseRequirement(
      `requirementDiagram\nrequirement a {\n}\nclass ${ids} ${classes}`
    );
    expect(diagnostics).toEqual([]);
    expect(model.styleCopies?.max).toBe(1_000_000);
    let error: unknown;
    try {
      checkStyleCopies(model);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(LimitError);
    expect(error).toMatchObject({
      code: 'LIMIT',
      limit: 'maxLayoutWork',
      max: 1_000_000,
      found: 1_000_001,
    });
    expect((error as LimitError).message).toMatch(/Shorten the repeated name lists/);
  });

  it('does nothing under the cap', () => {
    const { model } = parseRequirement('requirementDiagram\nrequirement a:::c {\n}\nclass a c');
    expect(model.styleCopies).toBeUndefined();
    expect(() => checkStyleCopies(model)).not.toThrow();
  });

  it('parses a class of 300,000 styles without overflowing the stack', () => {
    const src = `requirementDiagram\nelement a {\n}\n${'classDef c fill:red\n'.repeat(300_000)}class a c`;
    const { model } = parseRequirement(src);
    expect(model.elements[0]?.styles).toHaveLength(300_000);
  });
});

/** A parse through the plugin, with the integrator's `limits` when given. */
const parse = (text: string, limits?: Partial<Limits>) =>
  requirement.parse(text, {
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

/** The model's own count of boxes and relationships, which the caps count. */
const counts = (text: string): [number, number] => {
  const { model } = parse(text);
  return [model.requirements.length + model.elements.length, model.relations.length];
};

const box = (kind: string, name: string): string =>
  `  ${kind} ${name} {\n    ${kind === 'element' ? 'type: t' : 'id: 1'}\n  }`;

/** `n` requirements `r0`…, each tracing the next two: `2 × n` relationships. */
const ring = (n: number): string =>
  'requirementDiagram\n' +
  Array.from({ length: n }, (_, i) => box('requirement', `r${i}`)).join('\n') +
  '\n' +
  Array.from(
    { length: n },
    (_, i) => `  r${i} - traces -> r${(i + 1) % n}\n  r${i} - derives -> r${(i + 2) % n}`
  ).join('\n');

/** The sample of issue #747: six requirements and one relationship. */
const SAMPLE =
  'requirementDiagram\n' +
  Array.from({ length: 6 }, (_, i) => box('requirement', `r${i}`)).join('\n') +
  '\n  r0 - traces -> r1';

describe('requirement parse limits (R-SEC-5, #721, #747, D608)', () => {
  it("fails the issue's sample at maxNodes 5 and draws it at its exact counts", () => {
    expect(counts(SAMPLE)).toEqual([6, 1]);
    expect(limitCodes(SAMPLE, { maxNodes: 5 })).toEqual(['NODE_LIMIT']);
    expect(limitCodes(SAMPLE, { maxEdges: 0 })).toEqual(['EDGE_LIMIT']);
    expect(limitCodes(SAMPLE, { maxNodes: 6, maxEdges: 1 })).toEqual([]);
    sweep(SAMPLE, 'maxNodes', 6);
    sweep(SAMPLE, 'maxEdges', 1);
  });

  it('counts the 40 requirements and 80 relationships of the measured diagram', () => {
    const text = ring(40);
    expect(counts(text)).toEqual([40, 80]);
    expect(limitCodes(text, { maxNodes: 5 })).toEqual(['NODE_LIMIT']);
    expect(limitCodes(text, { maxEdges: 5 })).toEqual(['EDGE_LIMIT']);
    sweep(text, 'maxNodes', 40);
    sweep(text, 'maxEdges', 80);
  });

  it('reports the first box and relationship over the cap, in core words', () => {
    const nodes = parse(SAMPLE, { maxNodes: 5 }).diagnostics[0]!;
    expect(nodes.message).toBe(
      'The diagram has more than 5 requirements and elements, the limit. The limit is set by the page or app that renders the diagram.'
    );
    expect(SAMPLE.slice(nodes.range.start, nodes.range.end)).toMatch(/^requirement r5 \{/);
    const edges = parse(SAMPLE, { maxEdges: 0 }).diagnostics[0]!;
    expect(edges.message).toMatch(/^The diagram has more than 0 relationships, the limit\./);
    expect(SAMPLE.slice(edges.range.start, edges.range.end)).toBe('r0 - traces -> r1');
  });

  it.each([
    [
      'every requirement kind and elements',
      'requirementDiagram\n' +
        [
          'requirement a',
          'functionalRequirement b',
          'interfaceRequirement c',
          'performanceRequirement d',
          'physicalRequirement e',
          'designConstraint f',
          'element g',
        ]
          .map((def) => `  ${def} {\n  }`)
          .join('\n') +
        '\n  g - satisfies -> a',
      7,
      1,
    ],
    [
      'a requirement and an element of one name (two boxes)',
      `requirementDiagram\n${box('requirement', 'x')}\n${box('element', 'x')}`,
      2,
      0,
    ],
    [
      'a repeated definition (one box)',
      `requirementDiagram\n${box('requirement', 'x')}\n${box('requirement', 'x')}\n${box('element', 'y')}\n${box('element', 'y')}`,
      2,
      0,
    ],
    [
      'relationships to names no box has (which make no box)',
      `requirementDiagram\n${box('requirement', 'a')}\n  a - contains -> b\n  c - copies -> d\n  a <- refines - e`,
      1,
      3,
    ],
    [
      'repeated relationships',
      `requirementDiagram\n${box('element', 'a')}\n${box('element', 'b')}\n  a - verifies -> b\n  a - verifies -> b`,
      2,
      2,
    ],
  ])('counts %s', (_name, text, nodes, edges) => {
    expect(counts(text)).toEqual([nodes, edges]);
    sweep(text, 'maxNodes', nodes);
    sweep(text, 'maxEdges', edges);
  });

  it("defaults to core's maxNodes and maxEdges", () => {
    const boxes = (n: number) =>
      'requirementDiagram\n' + Array.from({ length: n }, (_, i) => `element e${i} {\n}`).join('\n');
    expect(limitCodes(boxes(10_000))).toEqual([]);
    expect(limitCodes(boxes(10_001))).toEqual(['NODE_LIMIT']);
    const relations = (n: number) =>
      'requirementDiagram\nelement a {\n}\n' + 'a - traces -> a\n'.repeat(n);
    expect(limitCodes(relations(5_000))).toEqual([]);
    expect(limitCodes(relations(5_001))).toEqual(['EDGE_LIMIT']);
  });
});
