import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { treeView } from './plugin.ts';

/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  treeView
    .parse(text, {
      config: {},
      preprocessed: preprocess(text),
      ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  treeView.parse(text, {
    config: {},
    preprocessed: preprocess(text),
    limits: resolveLimits(undefined, limits),
  } as unknown as DiagramParseContext).diagnostics[0]?.message;

const nested = (depth: number): string =>
  'treeView-beta\n' +
  Array.from({ length: depth + 1 }, (_, i) => `${' '.repeat(i + 1)}n${i}\n`).join('');

describe('treeView parse limits (R-SEC-5, #698)', () => {
  const tree = 'treeView-beta\n  a\n    b\n    c\n  d\n    e\n';

  it('counts the nodes against maxNodes, and reports the cap once, at the first over it', () => {
    expect(limitErrors(tree, { maxNodes: 5 })).toEqual([]);
    expect(limitErrors(tree, { maxNodes: 3 })).toEqual([`NODE_LIMIT ${tree.indexOf('d')}`]);
    expect(message(tree, { maxNodes: 3 })).toMatch(
      /more than 3 nodes, the limit\. The limit is set by the page or app/
    );
  });

  it('caps how deep a node may sit under a top node, reported once', () => {
    const deep = nested(4);
    expect(limitErrors(deep, { maxDepth: 4 })).toEqual([]);
    expect(limitErrors(deep, { maxDepth: 2 })).toEqual([`DEPTH_LIMIT ${deep.indexOf('n3')}`]);
    expect(message(deep, { maxDepth: 2 })).toMatch(/nested 3 deep here, over the limit of 2\./);
  });

  it("defaults to core's maxNodes and maxDepth", () => {
    const many = 'treeView-beta\n' + Array.from({ length: 10_001 }, (_, i) => `  n${i}`).join('\n');
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('n10000')}`]);
    expect(limitErrors(nested(100))).toEqual([]);
    const deep = nested(101);
    expect(limitErrors(deep)).toEqual([`DEPTH_LIMIT ${deep.indexOf('n101')}`]);
  });
});
