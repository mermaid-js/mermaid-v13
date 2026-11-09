import { describe, expect, it } from 'vitest';
import { parseRadar } from '@mermaid-js/diagram-radar';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PARSE-7, pitfall 5: the radar parser, value conversion and model resolution included, is
 * linear in input size. v12's accDescr converter (`/\s+$/gm`) is quadratic on a long blank run
 * inside a line, and a detailed curve is resolved per axis (a lookup, not a scan). Same frame
 * as `stress.spec.ts`: n and 8n units, best of five, bar 24x (linear ~8x, quadratic ~64x). Not
 * measured on a steady machine: the bar is a ratio.
 */
const SHAPES: [string, (n: number) => string][] = [
  ['blanks inside an accDescr block line', (n) => `radar-beta\naccDescr {a${' '.repeat(n)}b}`],
  [
    'blank lines inside an accDescr block',
    (n) => `radar-beta\naccDescr {a${' \n'.repeat(n / 2)}b}`,
  ],
  ['blank runs in a title', (n) => `radar-beta\ntitle a${'  b'.repeat(n / 3)}`],
  ['escapes in a label', (n) => `radar-beta\naxis A["${'\\n'.repeat(n / 2)}"]`],
  [
    'many axes',
    (n) => `radar-beta\naxis ${Array.from({ length: n / 6 }, (_, k) => `a${k}`).join(', ')}`,
  ],
  [
    'a detailed curve over many axes',
    (n) => {
      const names = Array.from({ length: n / 12 }, (_, k) => `a${k}`);
      return `radar-beta\naxis ${names.join(', ')}\ncurve c{${names.map((a, k) => `${a}: ${k}`).join(', ')}}`;
    },
  ],
  [
    'many curves',
    (n) =>
      'radar-beta\naxis A, B\n' +
      Array.from({ length: n / 16 }, (_, k) => `curve c${k}{1, 2}`).join('\n'),
  ],
  [
    'entries that name no axis',
    (n) => `radar-beta\naxis A\ncurve c{A 1, ${'X 1, '.repeat(n / 5)}A 2}`,
  ],
  ['an error on every line', (n) => 'radar-beta\n' + 'axis A B\n'.repeat(n / 9)],
  [
    'an unclosed curve over many lines',
    (n) => `radar-beta\naxis A\ncurve c{\n${'1,\n'.repeat(n / 3)}`,
  ],
  ['repeated options', (n) => 'radar-beta\n' + 'ticks 40\n'.repeat(n / 9)],
];

describe('stress: the radar parser is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      expect(
        linearRatio(
          () => parseRadar(small),
          () => parseRadar(large)
        )
      ).toBeLessThan(24);
    },
    30_000
  );
});
