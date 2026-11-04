import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { lexClass } from '@mermaid-js/diagram-class';

/**
 * Class lexer stress cases (R-PARSE-7, pitfalls.md 5): one per free-text state and per scan
 * that could go quadratic. Timing is asserted as a ratio, best of five trials.
 */
/** Best of five: lexing `make(2n)` takes at most ~3x `make(n)` (linear, not quadratic). */
function ratio(make: (n: number) => string, n = 40_000): number {
  const time = (src: string) => {
    let best = Infinity;
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      lexClass(src);
      best = Math.min(best, performance.now() - t0);
    }
    return best;
  };
  const small = make(n);
  const large = make(2 * n);
  time(small);
  return time(large) / Math.max(time(small), 2);
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
    expect(ratio(make)).toBeLessThan(3.5);
  });
});
