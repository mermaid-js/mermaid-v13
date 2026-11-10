import { describe, expect, it } from 'vitest';
import { parseIshikawa } from '@mermaid-js/diagram-ishikawa';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PARSE-7, pitfall 5 and 11: the ishikawa parser, model, AST ids, spans and warnings included,
 * is linear in input size. Same frame as `stress.spec.ts` (pie's pattern): n and 8n units, best
 * of five, bar 24x (linear ~8x, quadratic ~64x). Not measured on a steady machine: the bar is a
 * ratio.
 */
const H = 'ishikawa-beta\nP\n';
/** Lines indented 1, 2, …, `depth`, then again from 1, about `n` characters in all. */
const zigzag = (n: number, depth: number) => {
  const out: string[] = [];
  for (let size = 0, d = 1; size < n; d = (d % depth) + 1) {
    const line = `${'\t'.repeat(d)}c\n`;
    out.push(line);
    size += line.length;
  }
  return out.join('');
};
const SHAPES: [string, (n: number) => string][] = [
  ['flat causes', (n) => H + '  cause\n'.repeat(n / 8)],
  ['a cause with many sub-causes', (n) => H + '  A\n' + '    a\n'.repeat(n / 6)],
  ['nested causes, up and down', (n) => H + zigzag(n, 16)],
  ['a deep chain', (n) => H + zigzag(n, 120)],
  ['causes clamped to the baseline', (n) => H + '    A\n' + '  b\n'.repeat(n / 4)],
  ['a keyword line on every line', (n) => H + '  ishikawa x\n'.repeat(n / 13)],
  ['a blank pair before every line', (n) => H + '%%\n\n  A\n'.repeat(n / 8)],
  ['comment lines between causes', (n) => H + '  A\n%%\n%%\n'.repeat(n / 10)],
  ['blank lines between causes', (n) => H + '  A\n\n  \n\t\n'.repeat(n / 10)],
  ['long lines', (n) => H + `  ${'x'.repeat(n / 4)}\n`.repeat(4)],
  ['long indents', (n) => H + `${' '.repeat(n / 4)}x\n`.repeat(4)],
];

describe('stress: the ishikawa parser is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      expect(
        linearRatio(
          () => parseIshikawa(small),
          () => parseIshikawa(large)
        )
      ).toBeLessThan(24);
    },
    60_000
  );

  it('parses 80k cause lines into 80k causes, and a 2,000-deep chain', () => {
    const { model } = parseIshikawa(H + '  A\n'.repeat(80_000));
    expect(model.causes).toHaveLength(80_000);
    const deep = parseIshikawa(
      H + Array.from({ length: 2000 }, (_, d) => `${' '.repeat(d + 1)}c\n`).join('')
    );
    expect(deep.ast.children.at(-1)?.id).toBe(`cause:${Array(2000).fill('1').join('.')}`);
  });
});
