import { describe, expect, it } from 'vitest';
import { mindmapTokens, parseMindmap } from '@mermaid-js/diagram-mindmap';

/**
 * R-PARSE-7, pitfall 5: the mindmap lexer is linear in input size, in every free-text state.
 * Shape copied from `../timeline/stress.spec.ts`: n and 8n units; linear is ~8x, quadratic
 * ~64x, and the bar is 24x. Times are this thread's CPU time, and small and large lexes
 * alternate.
 */
const MM = 'mindmap\n  root\n';
const SHAPES: [string, (n: number) => string][] = [
  ['blank lines', (n) => MM + '\n'.repeat(n) + '  a'],
  ['blanks and line breaks', (n) => MM + ' \n'.repeat(n / 2) + '  a'],
  ['a long indent', (n) => MM + ' '.repeat(n) + 'a'],
  ['a line break, then a long indent', (n) => MM + '\n' + ' '.repeat(n) + 'a'],
  ['trailing blanks on every line', (n) => MM + ('  a' + ' '.repeat(30) + '\n').repeat(n / 34)],
  ['blanks then a percent comment', (n) => MM + ' '.repeat(n) + '%% c'],
  ['bare percent lines', (n) => MM + '%%\n'.repeat(n / 3)],
  ['percent comments after closers', (n) => MM + '  a(b) %% c\n'.repeat(n / 12)],
  ['a long id', (n) => MM + '  ' + 'a b'.repeat(n / 3)],
  ['a long multi-line label', (n) => MM + '  a(' + 'x\n'.repeat(n / 2) + ')'],
  ['an unclosed label', (n) => MM + '  a[' + 'x '.repeat(n / 2)],
  ['a label split by comment lines', (n) => MM + '  a(' + 'x\n%% c\n'.repeat(n / 7) + ')'],
  ['braces in labels', (n) => MM + '  a(b}c d}e)\n'.repeat(n / 14)],
  ['a long string', (n) => MM + '  a["' + 'x\n'.repeat(n / 2) + '"]'],
  ['an unclosed markdown string', (n) => MM + '  a["`' + 'x '.repeat(n / 2)],
  ['a long icon', (n) => MM + '  ::icon(' + 'x\n'.repeat(n / 2)],
  ['a long class', (n) => MM + '  :::' + 'x'.repeat(n)],
  ['bare class markers', (n) => MM + ':::\n'.repeat(n / 4)],
  ['shapes on one line', (n) => MM + '  ' + 'a(b)'.repeat(n / 4)],
  ['line separators', (n) => MM + '  a(b} c)\n'.repeat(n / 9)],
  ['entities', (n) => MM + '  a[' + '#a;'.repeat(n / 3) + ']'],
  ['CRLF lines', (n) => MM + '  a\r\n'.repeat(n / 5)],
  ['CRLF lines split by comment lines', (n) => MM + '  a\r\n%% c\r\n'.repeat(n / 11)],
  // A dropped `;` and many removed spans: each token's text is read across the cut text (at 16x
  // size, where a walk over every run per token shows).
  [
    'a style line, then CRLF lines split by comment lines',
    (n) => MM + '  style a:#f;\r\n' + '  a\r\n%% c\r\n'.repeat(n),
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

describe('stress: the mindmap lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      mindmapTokens(small); // warm up
      mindmapTokens(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => mindmapTokens(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => mindmapTokens(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});

/** Lines until the text is about `n` characters long. */
const lines = (n: number, line: (k: number) => string): string => {
  let out = 'mindmap\nroot\n';
  for (let k = 0; out.length < n; k++) out += line(k) + '\n';
  return out;
};

/**
 * R-PARSE-7, pitfall 19: the parser (tree building, AST ids, statement spans, recovery) is linear
 * in input size, with the same n and 8n ratio test as the lexer.
 */
const PARSE_SHAPES: [string, (n: number) => string][] = [
  ['a wide fan', (n) => lines(n, (k) => `  n${k}`)],
  ['a deep indent chain', (n) => lines(n, (k) => `${' '.repeat(k + 1)}n`)],
  ['deep then shallow, repeatedly', (n) => lines(n, (k) => `${' '.repeat((k % 40) + 1)}n${k}`)],
  ['repeated ids', (n) => lines(n, () => '  a[x]')],
  ['decorations on every node', (n) => lines(n, (k) => `  n${k}\n  :::a b\n  ::icon(fa fa-x)`)],
  ['second roots', (n) => lines(n, (k) => `r${k}`)],
  ['syntax errors on every line', (n) => lines(n, (k) => `  a[b] c${k}`)],
  // Class words looked up in the source around the cut directive (#389), on many lines and on
  // one long line, one with an entity word that is not found.
  ['class lines cut by directives', (n) => lines(n, (k) => `  :::a${k} %%{init: {}}%% b c`)],
  [
    'a long class line cut by a directive',
    (n) => `${MM}  :::x %%{init: {}}%% ${'a b '.repeat(n / 4)}`,
  ],
  ['a long class line with an entity', (n) => `${MM}  :::x %%{a}%% #35; ${'a '.repeat(n / 2)}`],
];

describe('stress: the mindmap parser is linear in input size', () => {
  it.each(PARSE_SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      parseMindmap(small); // warm up
      parseMindmap(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => parseMindmap(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => parseMindmap(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );

  it('parses a 10k-node mindmap', () => {
    const body = Array.from({ length: 10_000 }, (_, k) => `${' '.repeat((k % 8) + 1)}n${k}`);
    const src = ['mindmap', 'root', ...body].join('\n');
    const r = parseMindmap(src);
    expect(r.diagnostics).toEqual([]);
    expect(r.model.nodes).toHaveLength(10_001);
  });
});
