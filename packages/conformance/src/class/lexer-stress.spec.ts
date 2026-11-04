import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { lexClass } from '@mermaid-js/diagram-class';

/**
 * Class lexer stress cases (R-PARSE-7, pitfalls.md 5): one per free-text state and per scan
 * that could go quadratic. Timing is asserted as a ratio, best of five trials.
 */
/**
 * Lexing `make(4n)` against `make(n)`, best of five interleaved trials: about 4 when linear,
 * 16 when quadratic. The bound of 8 leaves room for a loaded machine.
 */
function ratio(make: (n: number) => string, n = 20_000): number {
  const small = make(n);
  const large = make(4 * n);
  let bestSmall = Infinity;
  let bestLarge = Infinity;
  for (let k = 0; k < 5; k++) {
    let t0 = performance.now();
    lexClass(small);
    bestSmall = Math.min(bestSmall, performance.now() - t0);
    t0 = performance.now();
    lexClass(large);
    bestLarge = Math.min(bestLarge, performance.now() - t0);
  }
  return bestLarge / Math.max(bestSmall, 1);
}

describe('class lexer stays linear (R-PARSE-7)', () => {
  it.each<[string, (n: number) => string]>([
    ['blanks before a line break', (n) => 'classDiagram\n' + ' '.repeat(n) + '\nA'],
    ['blanks with no line break', (n) => 'classDiagram\nA' + ' '.repeat(n) + 'B'],
    ['many direction words on a line', (n) => 'classDiagram\n' + 'direction x '.repeat(n / 10)],
    ['tokens on a line with direction', (n) => 'classDiagram\nA ' + 'b '.repeat(n) + 'direction'],
    ['a long class body line', (n) => 'classDiagram\nclass A {\n' + 'x'.repeat(n) + '\n}'],
    ['a string split by comment lines', (n) => 'classDiagram\nnote "' + 'a\n%% c\n'.repeat(n / 6)],
    ['runs of relation characters', (n) => 'classDiagram\nA ' + '<|--'.repeat(n / 4) + ' B'],
    ['entities', (n) => 'classDiagram\nA : ' + '#35;'.repeat(n / 4)],
  ])('%s', (_, make) => {
    expect(ratio(make)).toBeLessThan(8);
  });
});
