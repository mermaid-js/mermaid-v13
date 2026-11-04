import { describe, expect, it } from 'vitest';
import { sequenceTokens } from '@mermaid-js/diagram-sequence';

/**
 * R-PARSE-7, pitfall 5: the sequence lexer is linear in input size, in every free-text state.
 * Shape copied from `../stress.spec.ts`: n and 8n units; linear is ~8x, quadratic ~64x, and the
 * bar is 24x. Times are this thread's CPU time, and small and large lexes alternate.
 */
const SD = 'sequenceDiagram\n';
const SHAPES: [string, (n: number) => string][] = [
  ['blanks after participant, no id', (n) => SD + 'participant ' + ' '.repeat(n)],
  ['an id then a run of hashes before a colon', (n) => SD + 'participant A' + '#a'.repeat(n) + ':'],
  ['an id state run of blank-separated words', (n) => SD + 'participant ' + 'a '.repeat(n) + ','],
  ['an id followed by blanks before a word', (n) => SD + 'participant A' + ' '.repeat(n) + 'x'],
  ['an id followed by blank lines', (n) => SD + 'participant A' + '\n'.repeat(n)],
  ['an alias of blanks', (n) => SD + 'participant A as' + ' '.repeat(n)],
  ['many ids with blank lookaheads', (n) => SD + 'participant A  \n'.repeat(n / 16)],
  ['open participant metadata', (n) => SD + 'participant A@{' + 'x'.repeat(n)],
  ['a long a-a-a actor', (n) => SD + 'A' + '-a'.repeat(n / 2) + '->>B: x'],
  ['blanks before an arrow', (n) => SD + 'A' + ' '.repeat(n) + '->>B: x'],
  ['runs of arrow-like characters', (n) => SD + 'A' + '-/\\|<'.repeat(n / 5) + 'B'],
  ['a long message text', (n) => SD + 'A->>B:' + ' x'.repeat(n / 2)],
  [
    'an open accDescr body split by comment lines',
    (n) => SD + 'accDescr {' + 'x\n%% c\n'.repeat(n / 7),
  ],
  ['acc title blanks', (n) => SD + 'accTitle:' + ' '.repeat(n) + 'x'],
  ['title then blanks', (n) => SD + 'title ' + ' '.repeat(n)],
  ['title then blanks and text', (n) => SD + 'title ' + ' '.repeat(n) + 'x'],
  ['a long rest of line', (n) => SD + 'loop ' + ' x'.repeat(n / 2) + '\nend'],
  [
    'menu keywords before blank lines',
    (n) => SD + ('links' + ' '.repeat(50) + '\n').repeat(n / 56),
  ],
  ['text lines split by comment lines', (n) => SD + 'A->>B: x\n%% c\n'.repeat(n / 14)],
  ['percent comments', (n) => SD + 'x%%'.repeat(n / 3)],
  ['a long number', (n) => SD + 'autonumber ' + '1'.repeat(n) + '.5x'],
  ['entities', (n) => SD + 'A->>B: ' + '#a;'.repeat(n / 3)],
  ['CRLF lines', (n) => SD + 'A->>B: x\r\n'.repeat(n / 10)],
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

describe('stress: the sequence lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(12_500);
      const large = build(100_000);
      sequenceTokens(small); // warm up
      sequenceTokens(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => sequenceTokens(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => sequenceTokens(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
