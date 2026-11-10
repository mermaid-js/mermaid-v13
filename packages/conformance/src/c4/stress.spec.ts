import { describe, expect, it } from 'vitest';
import { c4Tokens } from '@mermaid-js/diagram-c4';
import { cost, MIN_MS, repeatsFor } from './timing.ts';

/**
 * R-PARSE-7, pitfall 5: the C4 lexer is linear in input size, in every free-text state, for
 * long unquoted arguments and deep nesting. Shape from `../packet/stress.spec.ts` (#531): n and
 * 8n units; linear is ~8x, quadratic ~64x, and the bar is 24x. Times are this thread's CPU
 * time, best of five, and small and large lexes alternate. The small lex repeats until it takes
 * at least {@link MIN_MS}, ten steps of the CPU clock or more, and the large one an eighth as
 * often, so the bar is a ratio of per-lex times well above the clock's step, never an absolute
 * bound. Not measured on a steady machine. A third entry times a shape at that many times the
 * size.
 */
const C = 'C4Context\n';
const SHAPES: [string, (n: number) => string, number?][] = [
  ['many statements', (n) => C + 'Person(p, "P", "D")\n'.repeat(n / 20)],
  ['a long unquoted argument', (n) => C + 'Person(a, ' + 'x '.repeat(n / 2) + ')'],
  ['an unquoted argument over many lines', (n) => C + 'Person(a, ' + 'x)\n'.repeat(n / 3)],
  ['a long quoted argument', (n) => C + 'Person(a, "' + 'x\n'.repeat(n / 2) + '")'],
  // One token over many removed spans: `emit` maps its end past each of them (`dropAt`).
  [
    'a quoted argument split by comment lines',
    (n) => C + 'Person(a, "' + 'x\n%% c\n'.repeat(n / 7) + '")',
  ],
  [
    'an unquoted argument split by comment lines',
    (n) => C + 'Person(a, ' + 'x\n%% c\n'.repeat(n / 7) + ')',
  ],
  [
    'a named value split by comment lines',
    (n) => C + 'Person(a, $k="' + 'x\n%% c\n'.repeat(n / 7) + '")',
  ],
  [
    'an accDescr block split by comment lines',
    (n) => C + 'accDescr {\n' + 'x\n%% c\n'.repeat(n / 7) + '}',
  ],
  [
    'a quoted argument split by directives',
    (n) => C + 'Person(a, "' + 'x%%{init: {}}%%'.repeat(n / 15) + '")',
  ],
  ['blanks before a closing paren', (n) => C + 'Person(a, "A"' + ' '.repeat(n) + ')'],
  ['blanks before closing parens', (n) => C + 'Person(a, "A"  )\n'.repeat(n / 17)],
  ['blanks before the closing brace of accDescr', (n) => C + 'accDescr {x' + ' '.repeat(n) + '}'],
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
  // Many tokens after many removed spans: each token's end is mapped past the spans from the
  // next unwritten one, never from the first (timed at 4 times the size, where a scan from the
  // first span reads about 50x).
  ['CRLF lines split by comment lines', (n) => C + 'Person(a, "A")\r\n%% c\r\n'.repeat(n / 22), 4],
  ['statements split by comment lines', (n) => C + 'Person(a, "A")\n%% c\n'.repeat(n / 20), 4],
  [
    'arguments split by comment lines',
    (n) => C + 'Person(a,\n%% c\n"A",\n%% c\n"B")\n'.repeat(n / 34),
    4,
  ],
  ['tag quotes', (n) => C + 'Person(a, "' + '<b c="x">'.repeat(n / 10) + '")'],
];

describe('stress: the C4 lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, scale = 1) => {
      const small = build(4_000 * scale);
      const large = build(32_000 * scale);
      c4Tokens(large); // warm up
      const reps = repeatsFor(() => c4Tokens(small));
      // The large input is 8 times the small one: an eighth of the runs keeps its window as long.
      const repsLarge = Math.max(1, reps / 8);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => c4Tokens(small), reps)
        );
        tLarge = Math.min(
          tLarge,
          cost(() => c4Tokens(large), repsLarge)
        );
      }
      // A reading of 0 means the clock did not move: a broken measurement, not a fast lex.
      expect(tSmall, `${reps} small runs read 0 ms (MIN_MS ${MIN_MS})`).toBeGreaterThan(0);
      expect(tLarge / repsLarge / (tSmall / reps)).toBeLessThan(24);
    },
    60_000
  );
});
