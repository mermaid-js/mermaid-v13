import { describe, expect, it } from 'vitest';
import { timelineTokens } from '@mermaid-js/diagram-timeline';

/**
 * R-PARSE-7, pitfall 5: the timeline lexer is linear in input size, in every free-text state.
 * Shape copied from `../sequence/stress.spec.ts`: n and 8n units; linear is ~8x, quadratic
 * ~64x, and the bar is 24x. Times are this thread's CPU time, and small and large lexes
 * alternate.
 */
const TL = 'timeline\n';
const SHAPES: [string, (n: number) => string][] = [
  ['blank lines', (n) => TL + '\n'.repeat(n) + '2002 : x'],
  ['blanks and line breaks', (n) => TL + ' \n'.repeat(n / 2) + '2002 : x'],
  ['timeline then blanks', (n) => 'timeline' + ' '.repeat(n) + 'x'],
  [
    'timeline then blanks, repeated',
    (n) => TL + ('timeline' + ' '.repeat(30) + 'x\n').repeat(n / 40),
  ],
  ['title then blanks', (n) => TL + 'title ' + ' '.repeat(n)],
  ['title then blank lines', (n) => TL + 'title\n\n'.repeat(n / 7)],
  ['section then blanks', (n) => TL + 'section ' + ' '.repeat(n) + ': x'],
  ['accTitle then blanks', (n) => TL + 'accTitle' + ' '.repeat(n) + 'x'],
  ['accDescr then blanks', (n) => TL + 'accDescr' + ' '.repeat(n) + 'x'],
  ['accDescr colon then blanks', (n) => TL + 'accDescr:' + ' '.repeat(n) + 'x'],
  ['an open accDescr body', (n) => TL + 'accDescr {' + 'x\n'.repeat(n / 2)],
  [
    'an open accDescr body split by comment lines',
    (n) => TL + 'accDescr {' + 'x\n%% c\n'.repeat(n / 7),
  ],
  ['a long period', (n) => TL + 'a '.repeat(n / 2) + ': x'],
  ['a long event', (n) => TL + '2002 : ' + 'x'.repeat(n)],
  ['an event of colons', (n) => TL + '2002 : ' + 'x:'.repeat(n / 2)],
  ['colons with blanks', (n) => TL + ': '.repeat(n / 2)],
  ['a period of hashes', (n) => TL + 'a#'.repeat(n / 2)],
  ['percent comments', (n) => TL + 'x%%'.repeat(n / 3)],
  ['single percents', (n) => TL + '%\n'.repeat(n / 2)],
  ['entities', (n) => TL + '2002 : ' + '#a;'.repeat(n / 3)],
  ['lines split by comment lines', (n) => TL + '2002 : x\n%% c\n'.repeat(n / 14)],
  ['CRLF lines', (n) => TL + '2002 : x\r\n'.repeat(n / 10)],
  // A dropped `;` and many removed spans: each token's text is read across the cut text (at 16x
  // size, where a walk over every run per token shows).
  [
    'a style line, then CRLF lines split by comment lines',
    (n) => TL + 'style a:#f;\r\n' + '2002 : x\r\n%% c\r\n'.repeat(n),
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

describe('stress: the timeline lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      timelineTokens(small); // warm up
      timelineTokens(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => timelineTokens(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => timelineTokens(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
