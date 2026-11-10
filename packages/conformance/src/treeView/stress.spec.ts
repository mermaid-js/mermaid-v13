import { describe, expect, it } from 'vitest';
import { treeViewTokens } from '@mermaid-js/diagram-treeview/testing';

/**
 * R-PARSE-7, pitfall 5: the treeView lexer and its box-drawing pass are linear in input size,
 * in every rule. v12's BARE_NAME is quadratic on blank runs inside a name (its lookahead rescans
 * the run at every blank: `a`, 16k blanks, `b` takes 368 ms, x4 per doubling, spec #518), and
 * its ACC_DESCR on lines of unclosed `accDescr {`. Shape copied from `../wardley/stress.spec.ts`
 * (pie's pattern): n and 8n units; linear is ~8x, quadratic ~64x, and the bar is 24x. Each
 * shape's `n` is picked so its small lex costs a few ms here, above the 2 ms floor of
 * `Math.max(tSmall, 2)`. Times are this thread's CPU time, best of five, and small and large
 * lexes alternate. Not measured on a steady machine: the bar is a ratio.
 */
const H = 'treeView-beta\n';
const B = H + 'root/\n';
/** `[name, build, n]`: `build(n)` is about `n` characters, lexed at `n` and `8n`. */
const SHAPES: [name: string, build: (n: number) => string, small: number][] = [
  ['a name, a long blank run, a name', (n) => H + '  a' + ' '.repeat(n) + 'b', 192_000],
  ['a name, a long tab run, a name', (n) => H + '  a' + '\t'.repeat(n) + 'b', 192_000],
  ['a name, a long blank run, a class', (n) => H + '  a' + ' '.repeat(n) + ':::x', 96_000],
  ['a name of words', (n) => H + '  a' + ' b'.repeat(n / 2), 32_000],
  ['a name of blank runs', (n) => H + '  a' + '    b'.repeat(n / 5), 64_000],
  ['a long name', (n) => H + '  ' + 'a'.repeat(n), 48_000],
  ['a name of failed classes', (n) => H + '  a' + ' ::: 1'.repeat(n / 6), 32_000],
  ['a name of failed classes after blanks', (n) => H + '  a' + ' :::   -'.repeat(n / 8), 32_000],
  ['a name of failed icons', (n) => H + '  a' + ' icon'.repeat(n / 5), 64_000],
  ['icons, never closed', (n) => H + '  a' + ' icon(x'.repeat(n / 7), 16_000],
  ['a class of a long name', (n) => H + '  a :::' + 'x'.repeat(n), 192_000],
  ['classes', (n) => H + '  a' + ' :::x'.repeat(n / 5), 48_000],
  ['a long description', (n) => H + '  a ##' + ' x'.repeat(n / 2), 48_000],
  ['an unterminated double quote', (n) => H + '  "' + 'x'.repeat(n), 48_000],
  ['an unterminated single quote over lines', (n) => H + "  '" + 'x\n'.repeat(n / 2), 8_000],
  ['quoted names', (n) => H + '  "a b"\n'.repeat(n / 8), 32_000],
  ['quotes inside names', (n) => H + '  a' + '"'.repeat(n), 48_000],
  ['lines of unclosed accDescr {', (n) => H + 'accDescr {\n'.repeat(n / 11), 64_000],
  ['accDescr then blank lines and no brace', (n) => H + 'accDescr' + '\n'.repeat(n), 16_000],
  ['accTitle then blanks and no colon', (n) => H + 'accTitle' + ' '.repeat(n) + 'x', 96_000],
  ['a long title', (n) => H + 'title ' + 'x '.repeat(n / 2), 48_000],
  ['title-prefixed names', (n) => H + '  title.txt\n'.repeat(n / 12), 32_000],
  ['blank lines', (n) => H + '  a' + '\n'.repeat(n), 16_000],
  ['blank runs on lines', (n) => H + '  a\n' + ' \t\n'.repeat(n / 3), 16_000],
  ['indented names', (n) => H + '        a\n'.repeat(n / 10), 32_000],
  ['comment lines', (n) => H + '  a\n' + '%% c\n'.repeat(n / 5), 64_000],
  ['inline comments', (n) => H + '  "a" %% c\n'.repeat(n / 11), 32_000],
  ['headers as names', (n) => H + 'treeView-beta\n'.repeat(n / 14), 32_000],
  ['headers with blanks', (n) => H + 'treeView-beta   x\n'.repeat(n / 18), 32_000],
  ['characters no rule takes', (n) => H + ':::'.repeat(n / 3), 8_000],
  ['CRLF lines', (n) => H + '  a :::x\r\n'.repeat(n / 10), 16_000],
  ['entities in names', (n) => H + '  a' + '#a;'.repeat(n / 3), 32_000],
  ['a box tree', (n) => B + '├── a/\n│   └── b\n'.repeat(n / 20), 16_000],
  ['a deep box line', (n) => B + '│   '.repeat(n / 4) + '└── x', 16_000],
  ['a box line with a long name', (n) => B + '├── ' + 'a '.repeat(n / 2), 16_000],
  ['a box line with long dashes', (n) => B + '├' + '─'.repeat(n) + ' x', 64_000],
  ['box lines with tabs', (n) => B + '\t├──\ta\tb\n'.repeat(n / 9), 16_000],
  ['decoration lines', (n) => B + '├── a\n' + '│   \n'.repeat(n / 5), 32_000],
  ['entities before branches', (n) => B + '#lt;├── a\n'.repeat(n / 10), 16_000],
  ['box comment lines', (n) => B + '├── a\n' + '%% ├── c\n'.repeat(n / 9), 96_000],
  ['no box glyph before the end', (n) => H + '  a\n'.repeat(n / 4) + '├── b', 8_000],
  ['a box glyph only in a comment', (n) => H + '%% ├\n' + '  a\n'.repeat(n / 4), 8_000],
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

describe('stress: the treeView lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, n) => {
      const small = build(n);
      const large = build(8 * n);
      treeViewTokens(small); // warm up
      treeViewTokens(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => treeViewTokens(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => treeViewTokens(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
