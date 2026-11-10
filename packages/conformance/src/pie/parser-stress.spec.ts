import { describe, expect, it } from 'vitest';
import { parsePie } from '@mermaid-js/diagram-pie';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PARSE-7, pitfall 5: the pie parser, value conversion included, is linear in input size.
 * v12's accDescr converter (`/\s+$/gm`) is quadratic on a long blank run inside a line. Same
 * frame as `stress.spec.ts`: n and 8n units, best of five, bar 24x (linear ~8x, quadratic
 * ~64x). Not measured on a steady machine: the bar is a ratio.
 */
const SHAPES: [string, (n: number) => string][] = [
  ['blanks inside an accDescr block line', (n) => `pie\naccDescr {a${' '.repeat(n)}b}`],
  ['blank lines inside an accDescr block', (n) => `pie\naccDescr {a${' \n'.repeat(n / 2)}b}`],
  ['NBSP runs inside an accDescr block', (n) => `pie\naccDescr {a${' '.repeat(n)}\nb}`],
  ['blank runs in a title', (n) => `pie\ntitle a${'  b'.repeat(n / 3)}`],
  ['escapes in a label', (n) => `pie\n"${'\\n'.repeat(n / 2)}": 1`],
  [
    'many sections',
    (n) => 'pie\n' + Array.from({ length: n / 10 }, (_, k) => `"s${k}": ${k}`).join('\n'),
  ],
  ['one label repeated', (n) => 'pie\n' + '"a": 1\n'.repeat(n / 7)],
  ['an error on every line', (n) => 'pie\n' + '"a" 1\n'.repeat(n / 6)],
  [
    'negative values',
    (n) => 'pie\n' + Array.from({ length: n / 10 }, (_, k) => `"s${k}": -1`).join('\n'),
  ],
  ['repeated titles', (n) => 'pie\n' + 'title x\n'.repeat(n / 8)],
];

describe('stress: the pie parser is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      expect(
        linearRatio(
          () => parsePie(small),
          () => parsePie(large)
        )
      ).toBeLessThan(24);
    },
    30_000
  );
});
