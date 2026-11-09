import { describe, expect, it } from 'vitest';
import { parseVenn } from '@mermaid-js/diagram-venn';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PARSE-7, pitfall 5 and 11: the venn parser, model and warnings included, is linear in
 * input size. Same frame as `stress.spec.ts` (pie's pattern): n and 8n units, best of five,
 * bar 24x (linear ~8x, quadratic ~64x). Not measured on a steady machine: the bar is a ratio.
 */
const V = 'venn-beta\n';
const ids = (n: number, p = 's') => Array.from({ length: n }, (_, k) => `${p}${k}`);
const sets = (n: number) =>
  ids(n)
    .map((id) => `set ${id}`)
    .join('\n') + '\n';
const SHAPES: [string, (n: number) => string][] = [
  ['set lines', (n) => V + sets(n / 8)],
  ['one union of many sets', (n) => V + sets(n / 12) + `union ${ids(n / 12).join(',')}\n`],
  [
    'indented text lines under a wide union',
    (n) => V + sets(n / 32) + `union ${ids(n / 32).join(',')}\n` + '  text t\n'.repeat(n / 16),
  ],
  ['repeated sets and unions', (n) => V + 'set A\nset B\n' + 'set A\nunion A,B\n'.repeat(n / 20)],
  ['text nodes in undeclared areas', (n) => V + 'set A\n' + 'text Z,Q t\n'.repeat(n / 11)],
  [
    'negative sizes',
    (n) =>
      V +
      ids(n / 10)
        .map((id) => `set ${id}:-1`)
        .join('\n'),
  ],
  ['a style with many value tokens', (n) => V + 'set A\nstyle A fill: ' + 'red '.repeat(n / 4)],
  ['a style with many fields', (n) => V + 'set A\nstyle A ' + 'a: 1, '.repeat(n / 6) + 'b: 2'],
  ['one-id style targets', (n) => V + 'set A\n  text t\n' + 'style t color: red\n'.repeat(n / 19)],
  ['a syntax error on every line', (n) => V + 'set A B\n'.repeat(n / 8)],
  ['a lexer error on every line', (n) => V + 'set A;\n'.repeat(n / 7)],
  ['a union check on every line', (n) => V + 'union A,B\n'.repeat(n / 10)],
  ['statements on one line', (n) => V + 'set A '.repeat(n / 6)],
  ['repeated titles', (n) => V + 'title x\n'.repeat(n / 8)],
];

describe('stress: the venn parser is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      expect(
        linearRatio(
          () => parseVenn(small),
          () => parseVenn(large)
        )
      ).toBeLessThan(24);
    },
    60_000
  );

  it('parses 80k `set` lines into 80k sets', () => {
    const { model } = parseVenn(V + '  set A\n'.repeat(80_000));
    expect(model.subsets).toHaveLength(80_000);
  });
});
