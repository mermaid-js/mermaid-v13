import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { ishikawa } from './plugin.ts';

/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  ishikawa
    .parse(text, {
      preprocessed: preprocess(text),
      ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  ishikawa
    .parse(text, {
      preprocessed: preprocess(text),
      limits: resolveLimits(undefined, limits),
    } as unknown as DiagramParseContext)
    .diagnostics.find((d) => d.severity === 'error')?.message;

const chain = (depth: number): string =>
  'ishikawa-beta\n  Effect\n' +
  Array.from({ length: depth }, (_, i) => `${' '.repeat(i + 2)}c${i + 1}\n`).join('');

describe('ishikawa parse limits (R-SEC-5, #721)', () => {
  const bone = 'ishikawa-beta\n  Effect\n  A\n    a1\n    a2\n  B\n    b1\n';

  it('counts the causes against maxNodes, and reports the cap once, at the first over it', () => {
    expect(limitErrors(bone, { maxNodes: 5 })).toEqual([]);
    expect(limitErrors(bone, { maxNodes: 3 })).toEqual([`NODE_LIMIT ${bone.indexOf('B\n')}`]);
    expect(message(bone, { maxNodes: 3 })).toMatch(
      /more than 3 causes, the limit\. The limit is set by the page or app/
    );
  });

  it('caps how deep a cause may sit under the effect, reported once', () => {
    const deep = chain(5);
    expect(limitErrors(deep, { maxDepth: 5 })).toEqual([]);
    expect(limitErrors(deep, { maxDepth: 2 })).toEqual([`DEPTH_LIMIT ${deep.indexOf('c3')}`]);
    expect(message(deep, { maxDepth: 2 })).toMatch(/nested 3 deep here, over the limit of 2\./);
  });

  it('counts the depth in the tree, not the indent', () => {
    const wide = 'ishikawa-beta\n  Effect\n  A\n          a1\n';
    expect(limitErrors(wide, { maxDepth: 2 })).toEqual([]);
  });

  it("defaults to core's maxNodes and maxDepth", () => {
    const many =
      'ishikawa-beta\n  Effect\n' + Array.from({ length: 10_001 }, (_, i) => `  c${i}`).join('\n');
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('c10000')}`]);
    expect(limitErrors(chain(100))).toEqual([]);
    const deep = chain(101);
    expect(limitErrors(deep)).toEqual([`DEPTH_LIMIT ${deep.indexOf('c101')}`]);
  });
});
