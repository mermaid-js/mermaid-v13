import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { classDiagram } from './plugin.ts';

/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  classDiagram
    .parse(text, {
      preprocessed: preprocess(text),
      ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);

const lines = (count: number, line: (i: number) => string): string =>
  'classDiagram\n' + Array.from({ length: count }, (_, i) => `  ${line(i)}\n`).join('');
/** #748's sample: 15 relations `C0 --> C1` … that each make both ends, 30 classes. */
const pairs = lines(15, (i) => `C${2 * i} --> C${2 * i + 1}`);
/** 29 relations `C0 --> C1`, `C1 --> C2` … : after the first, each makes one end, 30 classes. */
const chain = lines(29, (i) => `C${i} --> C${i + 1}`);
/** Where class `C<n>` is first named in `text`. */
const at = (text: string, n: number): number => new RegExp(`\\bC${n}\\b`).exec(text)?.index ?? -1;

describe('class parse limits (R-SEC-5, #748)', () => {
  it.each([
    ['both ends new', pairs],
    ['one end new', chain],
  ])('reports maxNodes at every value under the class count (%s)', (_, text) => {
    for (let max = 1; max <= 31; max++) {
      const expected = max < 30 ? [`NODE_LIMIT ${at(text, max)}`] : [];
      expect(limitErrors(text, { maxNodes: max }), `maxNodes: ${max}`).toEqual(expected);
    }
  });

  it('counts a relation to itself as one class', () => {
    const text = 'classDiagram\nA --> A\nB --> C\n';
    expect(limitErrors(text, { maxNodes: 3 })).toEqual([]);
    expect(limitErrors(text, { maxNodes: 2 })).toEqual([`NODE_LIMIT ${text.indexOf('C\n')}`]);
    expect(limitErrors(text, { maxNodes: 1 })).toEqual([`NODE_LIMIT ${text.indexOf('B')}`]);
  });
});
