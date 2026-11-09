import { describe, expect, it } from 'vitest';
import { requirementTokens } from '@mermaid-js/diagram-requirement';

/**
 * R-PARSE-7, pitfall 5: the requirement lexer is linear in input size, in every rule that scans
 * free text. v12 is not: its `.*direction\s+XX[^\n]*` rules rescan the rest of a line at every
 * token (a 47 KB line takes 2.1 s), and its shared `style.*:\S*#.*;` rewrite is cubic on a long
 * `style` line (16 KB: 8.8 s). Shape from `../pie/stress.spec.ts`: n and 8n units, up to 80k
 * lines; linear is ~8x, quadratic ~64x, and the bar is 24x. Times are this thread's CPU time,
 * best of five, and small and large lexes alternate.
 */
const H = 'requirementDiagram\n';
const BLOCK = 'requirement a {\n  id: 1\n  text: t\n  risk: high\n  verifymethod: test\n}\n';
const SHAPES: [string, (n: number) => string][] = [
  ['requirement blocks', (n) => H + BLOCK.repeat(n / 6)],
  ['relation lines', (n) => H + 'a - satisfies -> b\n'.repeat(n)],
  ['a long line', (n) => H + 'a - traces -> ' + 'x '.repeat(n)],
  ['a long line of tokens', (n) => H + 'a - traces -> b '.repeat(n / 4)],
  ['a long line with mid-line directions', (n) => H + 'x direction LR '.repeat(n / 4)],
  ['a long line of mid-line arrows', (n) => H + 'x - '.repeat(n / 2) + 'direction LR'],
  ['a direction then a long line', (n) => H + 'direction LR ' + 'direction TB '.repeat(n / 4)],
  ['direction lines', (n) => H + '  direction LR\n'.repeat(n)],
  ['lines that start with direction', (n) => H + 'direction x\n'.repeat(n)],
  ['a long style line', (n) => H + 'style a ' + 'fill:#f00,'.repeat(n / 4) + ';'],
  ['a long style line of semicolons', (n) => H + 'style a fill:#f;' + 'x:#0;'.repeat(n / 2)],
  ['a long classDef line', (n) => H + 'classDef c ' + 'stroke-width:4px,'.repeat(n / 4)],
  ['a long style line with spaces', (n) => H + 'style a fill:' + ' '.repeat(n) + 'red'],
  ['style lines', (n) => H + 'style a fill:#f9f,stroke:#333\n'.repeat(n / 2)],
  ['an unterminated quote', (n) => H + 'requirement "' + 'x '.repeat(n)],
  ['an unterminated quote over lines', (n) => H + 'requirement "' + 'x\n'.repeat(n)],
  ['a long quoted string', (n) => H + 'requirement "' + 'x\n'.repeat(n) + '" {\n}'],
  [
    'a quoted string split by comment lines',
    (n) => H + 'requirement "' + 'x\n%% c\n'.repeat(n / 2) + '" {\n}',
  ],
  ['a title split by comment lines', (n) => H + 'title' + '\n%% c'.repeat(n / 2) + '\nx'],
  [
    'an accDescr block split by comment lines',
    (n) => H + 'accDescr {' + 'x\n%% c\n'.repeat(n / 2) + '}',
  ],
  ['many strings', (n) => H + '"a" - traces -> "b"\n'.repeat(n / 2)],
  ['quotes in a style line', (n) => H + 'style ' + '"a",'.repeat(n / 2)],
  ['blanks before a line end', (n) => H + 'requirement a {' + ' '.repeat(n) + '\n}'],
  ['trailing blanks on every line', (n) => H + BLOCK.replace(/\n/g, '  \n').repeat(n / 6)],
  ['blank lines with blanks', (n) => H + '   \n'.repeat(n) + 'a - traces -> b'],
  ['a long indent', (n) => H + ' '.repeat(n) + 'a - traces -> b'],
  ['a long indent before direction', (n) => H + ' '.repeat(n) + 'direction LR'],
  ['blanks between tokens', (n) => H + 'requirement' + ' '.repeat(n) + 'a {\n}'],
  ['a long title', (n) => H + 'title ' + 'x '.repeat(n)],
  ['bare title lines', (n) => H + 'title\n'.repeat(n)],
  ['a long accTitle', (n) => H + 'accTitle: ' + 'x '.repeat(n)],
  ['an unclosed accDescr block', (n) => H + 'accDescr {' + 'x\n'.repeat(n)],
  ['comment lines', (n) => H + '# c\n% d\n'.repeat(n / 2)],
  ['%% comment lines', (n) => H + 'a - traces -> b\n%% c\n'.repeat(n / 2)],
  ['comments after statements', (n) => H + 'requirement a { # c\n}\n'.repeat(n / 2)],
  ['a long comment', (n) => H + '#' + 'x'.repeat(n)],
  ['entities', (n) => H + 'text: ' + '#35;'.repeat(n / 4)],
  ['errors', (n) => H + '@'.repeat(n)],
  ['errors in a style line', (n) => H + 'style a ' + '.'.repeat(n)],
  ['dashes', (n) => H + 'a ' + '-'.repeat(n)],
  ['style separators', (n) => H + 'a' + ':::b'.repeat(n / 4)],
  ['CRLF lines', (n) => H + 'a - traces -> b\r\n'.repeat(n / 2)],
  ['CRLF lines split by comment lines', (n) => H + 'a - traces -> b\r\n%% c\r\n'.repeat(n / 2)],
  [
    'a style line, then CRLF lines split by comment lines',
    (n) => H + 'style a fill:#f;\r\n' + 'a - traces -> b\r\n%% c\r\n'.repeat(n / 2),
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

describe('stress: the requirement lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(10_000);
      const large = build(80_000);
      requirementTokens(small); // warm up
      requirementTokens(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => requirementTokens(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => requirementTokens(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    60_000
  );

  it('lexes 80k relation lines, six tokens each', () => {
    // RD NEWLINE, then unqString LINE SATISFIES END_ARROW_R unqString NEWLINE per line, then EOF.
    const tokens = requirementTokens(H + 'a - satisfies -> b\n'.repeat(80_000));
    expect(tokens).toHaveLength(3 + 6 * 80_000);
  });
});
