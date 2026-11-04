import { describe, expect, it } from 'vitest';
import { erTokens } from '@mermaid-js/diagram-er';

/**
 * Linear lexing (R-PARSE-7): every scan that can fail after reading ahead (blank runs, the
 * `.*direction` rules, `~…~` attribute types, unclosed quotes, comment lines after blank lines,
 * entities and style semicolons) is cached or skips what it read. The time for 4n characters
 * stays within a small multiple of the time for n (linear: 4, quadratic: 16), best of 7
 * after a warm-up run.
 */
const N = 40_000;
const CASES: [string, (n: number) => string][] = [
  ['blanks in the initial state', (n) => 'erDiagram\nA' + ' '.repeat(n) + 'x'],
  ['an opener before a long blank run', (n) => 'erDiagram\naccTitle' + ' \n'.repeat(n) + 'x'],
  ['many `direction` words on one line', (n) => 'erDiagram\n' + 'direction x '.repeat(n)],
  ['`direction` before a long blank run', (n) => 'erDiagram\ndirection' + ' \n'.repeat(n) + 'x'],
  ['many block tokens before one `~`', (n) => 'erDiagram\nA {\n' + 'a! '.repeat(n) + '~\n}'],
  ['a block line of `~`', (n) => 'erDiagram\nA {\n' + '~!'.repeat(n) + '\n}'],
  ['an unclosed quote', (n) => 'erDiagram\n"' + 'a'.repeat(n)],
  ['many unclosed quotes in a block', (n) => 'erDiagram\nA {\n' + 'x "'.repeat(n)],
  ['a comment after blank lines', (n) => 'erDiagram\nA\n' + ' \n'.repeat(n) + '%% c\nB'],
  ['blank lines with `%%` alone', (n) => 'erDiagram\n' + '%%\n \n'.repeat(n) + 'B'],
  ['style entities and semicolons', (n) => 'erDiagram\nstyle A fill:#a' + '#a;'.repeat(n) + ';'],
  ['`1` before blanks', (n) => 'erDiagram\n' + '1 '.repeat(n)],
  ['`<tag` without `>`', (n) => 'erDiagram\n' + '<a ="x'.repeat(n)],
];

function best(src: string): number {
  erTokens(src); // warm-up: the first run pays for compilation
  let min = Infinity;
  for (let k = 0; k < 7; k++) {
    const t0 = performance.now();
    erTokens(src);
    min = Math.min(min, performance.now() - t0);
  }
  return min;
}

describe('ER lexer is linear', () => {
  it.each(CASES)('%s', { timeout: 60_000 }, (_, make) => {
    const small = best(make(N));
    const large = best(make(4 * N));
    expect(large / Math.max(small, 0.5)).toBeLessThan(10);
  });
});
