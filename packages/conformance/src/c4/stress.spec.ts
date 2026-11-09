import { describe, expect, it } from 'vitest';
import { c4Tokens } from '@mermaid-js/diagram-c4';

/**
 * R-PARSE-7, pitfall 5: the C4 lexer is linear in input size, in every free-text state, for
 * long unquoted arguments and deep nesting. Shape copied from `../kanban/stress.spec.ts`: n and
 * 8n units; linear is ~8x, quadratic ~64x, and the bar is 24x. Times are this thread's CPU
 * time, and small and large lexes alternate.
 */
const C = 'C4Context\n';
const SHAPES: [string, (n: number) => string][] = [
  ['many statements', (n) => C + 'Person(p, "P", "D")\n'.repeat(n / 20)],
  ['a long unquoted argument', (n) => C + 'Person(a, ' + 'x '.repeat(n / 2) + ')'],
  ['an unquoted argument over many lines', (n) => C + 'Person(a, ' + 'x)\n'.repeat(n / 3)],
  ['a long quoted argument', (n) => C + 'Person(a, "' + 'x\n'.repeat(n / 2) + '")'],
  ['an unclosed quote', (n) => C + 'Person(a, "' + 'x '.repeat(n / 2)],
  ['many empty arguments', (n) => C + 'Person(' + ','.repeat(n) + ')'],
  ['blanks after an opening paren', (n) => C + 'Person(' + ' '.repeat(n) + 'a)'],
  ['blanks before a quote', (n) => C + 'Person(a,' + ' '.repeat(n) + '"A")'],
  ['a long named argument', (n) => C + 'Person(a, $k="' + 'v'.repeat(n) + '")'],
  ['a name with no equals sign', (n) => C + 'Person(a, $' + 'k'.repeat(n)],
  ['blanks after an equals sign', (n) => C + 'Person(a, $k=' + ' '.repeat(n) + 'x)'],
  [
    'deep boundary nesting',
    (n) => C + 'Boundary(b, "B") {\n'.repeat(n / 20) + 'Person(a, "A")\n' + '}\n'.repeat(n / 20),
  ],
  ['many boundaries', (n) => C + 'Boundary(b, "B") {\nPerson(a, "A")\n}\n'.repeat(n / 36)],
  ['a long title', (n) => C + 'title ' + 'x '.repeat(n / 2)],
  ['entities in a title', (n) => C + 'title ' + '#amp;'.repeat(n / 5)],
  ['a long accDescr block', (n) => C + 'accDescr {\n' + 'x\n'.repeat(n / 2) + '}'],
  ['an unclosed accDescr block', (n) => C + 'accDescr {' + 'x '.repeat(n / 2)],
  ['accTitle and blanks with no colon', (n) => C + 'accTitle' + ' '.repeat(n)],
  ['many accDescr with no colon', (n) => C + 'accDescr '.repeat(n / 9)],
  ['a long comment', (n) => C + 'Person(a, "A") %% ' + 'c'.repeat(n)],
  ['many mid-line comments', (n) => C + 'Person(a, "A") %% c\n'.repeat(n / 20)],
  ['comment lines', (n) => C + '%% c\n'.repeat(n / 5) + 'Person(a, "A")'],
  ['blank lines', (n) => C + '\n'.repeat(n) + 'Person(a, "A")'],
  ['blanks and line breaks', (n) => C + ' \n'.repeat(n / 2) + 'Person(a, "A")'],
  ['a long blank run', (n) => C + ' '.repeat(n) + 'Person(a, "A")'],
  // The `.*direction` rules: each token start on a line looks at the rest of it.
  ['statements on one line', (n) => C + 'Person(a, "A")'.repeat(n / 14)],
  [
    'statements on one line, then direction',
    (n) => C + 'Person(a, "A")'.repeat(n / 14) + ' direction XY',
  ],
  ['many direction words', (n) => C + 'Person(a, "' + 'direction '.repeat(n / 10) + '")'],
  ['direction words in a line of junk', (n) => C + 'x direction '.repeat(n / 12)],
  ['direction and a long blank run', (n) => C + 'direction' + ' '.repeat(n) + 'XY'],
  ['direction lines', (n) => C + 'direction TB\n'.repeat(n / 13)],
  // Errors: one character each, lexing goes on.
  ['a long unknown word', (n) => C + 'x'.repeat(n)],
  ['repeated keyword prefixes', (n) => C + 'Person'.repeat(n / 6)],
  ['semicolons', (n) => C + ';'.repeat(n)],
  ['blanks after a macro keyword', (n) => C + 'Person' + ' '.repeat(n) + '(a)'],
  ['CRLF lines', (n) => C + 'Person(a, "A")\r\n'.repeat(n / 16)],
  ['CRLF lines split by comment lines', (n) => C + 'Person(a, "A")\r\n%% c\r\n'.repeat(n / 22)],
  ['tag quotes', (n) => C + 'Person(a, "' + '<b c="x">'.repeat(n / 10) + '")'],
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

describe('stress: the C4 lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      c4Tokens(small); // warm up
      c4Tokens(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => c4Tokens(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => c4Tokens(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
