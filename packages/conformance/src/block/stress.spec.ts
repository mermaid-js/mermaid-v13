import { describe, expect, it } from 'vitest';
import { blockTokens } from '@mermaid-js/diagram-block';

/**
 * R-PARSE-7, pitfall 5: the block lexer is linear in input size, in every rule that scans free
 * text or a blank run. Shape from `../venn/stress.spec.ts`: n and 8n units, up to 80k lines;
 * linear is ~8x, quadratic ~64x, and the bar is 24x. Times are this thread's CPU time, best of
 * five, and small and large lexes alternate.
 */
const B = 'block\n';
const SHAPES: [string, (n: number) => string][] = [
  ['id lines', (n) => B + '  a\n'.repeat(n)],
  ['ids on one line', (n) => B + ' a'.repeat(n)],
  ['shaped blocks with spans', (n) => B + '  a["x"]:2\n'.repeat(n / 2)],
  ['edges', (n) => B + '  a --> b\n'.repeat(n / 2)],
  ['labelled edges', (n) => B + '  a -- "l" --> b\n'.repeat(n / 4)],
  ['block arrows', (n) => B + '  a<["x"]>(right, left)\n'.repeat(n / 4)],
  ['composites', (n) => B + '  block:g\n    a\n  end\n'.repeat(n / 4)],
  ['nested composites', (n) => B + '  block\n'.repeat(n / 2) + '  end\n'.repeat(n / 2)],
  ['blank lines', (n) => B + '  a\n' + '\n'.repeat(n) + '  b'],
  ['a long blank run', (n) => B + '  a' + ' '.repeat(n) + 'b'],
  ['blanks after columns', (n) => B + '  columns' + ' '.repeat(n) + 'x'],
  ['blanks after accTitle', (n) => B + '  accTitle' + ' '.repeat(n) + 'x'],
  ['blanks after end', (n) => B + '  block\n  end' + ' \n'.repeat(n / 2) + 'a'],
  ['blanks after a link', (n) => B + '  a -->' + ' '.repeat(n) + 'b'],
  ['blanks after a start link', (n) => B + '  a --' + ' '.repeat(n) + 'b'],
  ['blanks in a link label', (n) => B + '  a -- "l"' + ' '.repeat(n) + 'b'],
  ['blanks in arrow directions', (n) => B + '  a<["x"]>(' + ' '.repeat(n) + 'z)'],
  ['blanks before an arrow paren', (n) => B + '  a<["x"]>' + ' '.repeat(n) + 'z'],
  ['blanks in a shape', (n) => B + '  a[' + ' '.repeat(n) + '"x"]'],
  ['dots in a link label', (n) => B + '  a -. "l"' + '.'.repeat(n) + ' b'],
  ['dots after a start link', (n) => B + '  a -.' + '.'.repeat(n) + ' b'],
  ['dashes', (n) => B + '  a ' + '-'.repeat(n) + ' b'],
  ['lone dashes', (n) => B + '  a' + ' -'.repeat(n / 2)],
  ['equals', (n) => B + '  a ' + '='.repeat(n) + ' b'],
  ['a long class list', (n) => B + '  class ' + 'a,'.repeat(n / 2) + 'b c'],
  ['a class list over lines', (n) => B + '  class ' + 'a,\n'.repeat(n / 2) + 'b c'],
  ['class lists', (n) => B + '  class a,b,c d\n'.repeat(n / 8)],
  ['a class list ending in blanks', (n) => B + '  class a,' + '\n'.repeat(n) + '!'],
  ['a long style line', (n) => B + '  style a ' + 'fill:red,'.repeat(n / 9)],
  ['class definitions', (n) => B + '  classDef c fill:#f00;\n'.repeat(n / 8)],
  ['a long string', (n) => B + '  a["' + 'x\n'.repeat(n) + '"]'],
  ['an unterminated string', (n) => B + '  a["' + 'x '.repeat(n)],
  ['unterminated strings', (n) => B + '  a' + '"'.repeat(n)],
  ['an unterminated markdown string', (n) => B + '  a["`' + 'x '.repeat(n)],
  ['backticks in a markdown string', (n) => B + '  a["`' + '`'.repeat(n)],
  ['an unterminated accDescr', (n) => B + '  accDescr {' + 'x\n'.repeat(n)],
  ['errors', (n) => B + '  a ' + '}'.repeat(n)],
  ['bare percent lines', (n) => B + '  a\n' + '%%\n'.repeat(n)],
  ['comment lines', (n) => B + '  a\n' + '%% c\n'.repeat(n / 2)],
  ['a string split by comment lines', (n) => B + '  a["' + 'x\n%% c\n'.repeat(n / 4) + '"]'],
  ['entities', (n) => B + '  a["' + '#35;'.repeat(n / 4) + '"]'],
  ['CRLF lines', (n) => B + '  a\r\n'.repeat(n / 2)],
  ['CRLF lines split by comment lines', (n) => B + '  a\r\n%% c\r\n'.repeat(n / 2)],
  [
    'a style line, then CRLF lines split by comment lines',
    (n) => B + '  style a fill:#f;\r\n' + '  a\r\n%% c\r\n'.repeat(n / 2),
  ],
];

/** CPU ms of this thread (the process on Node versions without threadCpuUsage). */
const cpuMs = (): number => {
  const u =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return (u.user + u.system) / 1000;
};
const cost = (run: () => unknown): number => {
  const t0 = cpuMs();
  run();
  return cpuMs() - t0;
};

describe('stress: the block lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(10_000);
      const large = build(80_000);
      blockTokens(small); // warm up
      blockTokens(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => blockTokens(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => blockTokens(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    60_000
  );

  it('lexes 80k id lines, one token each', () => {
    // BLOCK_DIAGRAM_KEY, then NODE_ID per line, then EOF.
    expect(blockTokens(B + '  a\n'.repeat(80_000))).toHaveLength(2 + 80_000);
  });
});
