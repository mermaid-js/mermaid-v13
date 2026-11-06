import { describe, expect, it } from 'vitest';
import { ganttTokens } from '@mermaid-js/diagram-gantt';

/**
 * R-PARSE-7, pitfall 5: the gantt lexer is linear in input size, in every free-text state.
 * Shape copied from `../timeline/stress.spec.ts`: n and 8n units; linear is ~8x, quadratic
 * ~64x, and the bar is 24x. Times are this thread's CPU time, and small and large lexes
 * alternate.
 */
const G = 'gantt\n';
const SHAPES: [string, (n: number) => string][] = [
  ['blank lines', (n) => G + '\n'.repeat(n) + 'a :1d'],
  ['blanks and line breaks', (n) => G + ' \n'.repeat(n / 2) + 'a :1d'],
  ['gantt then blanks', (n) => 'gantt' + ' '.repeat(n) + 'x'],
  ['title then blanks', (n) => G + 'title ' + ' '.repeat(n)],
  ['title then blank lines', (n) => G + 'title\n\n'.repeat(n / 7)],
  ['section then blanks', (n) => G + 'section ' + ' '.repeat(n) + 'x'],
  ['dateFormat then blank lines', (n) => G + 'dateFormat\n\n'.repeat(n / 12)],
  ['weekday then blanks', (n) => G + 'weekday' + ' '.repeat(n) + 'x'],
  ['weekday then blanks, repeated', (n) => G + ('weekday' + ' '.repeat(30) + 'x\n').repeat(n / 40)],
  ['accTitle then blanks', (n) => G + 'accTitle' + ' '.repeat(n) + 'x'],
  ['accDescr then blanks', (n) => G + 'accDescr' + ' '.repeat(n) + 'x'],
  ['accDescr colon then blanks', (n) => G + 'accDescr:' + ' '.repeat(n) + 'x'],
  ['an open accDescr body', (n) => G + 'accDescr {' + 'x\n'.repeat(n / 2)],
  [
    'an open accDescr body split by comment lines',
    (n) => G + 'accDescr {' + 'x\n%% c\n'.repeat(n / 7),
  ],
  ['click then blanks', (n) => G + 'click' + ' '.repeat(n) + 'a'],
  ['href then blanks', (n) => G + 'href' + ' '.repeat(n) + 'x'],
  ['call then blanks', (n) => G + 'call' + ' '.repeat(n) + 'x'],
  ['an open link', (n) => G + 'click a href "' + 'x\n'.repeat(n / 2)],
  ['an open link split by comment lines', (n) => G + 'click a href "' + 'x\n%% c\n'.repeat(n / 7)],
  ['an open callback name', (n) => G + 'click a call ' + 'x\n'.repeat(n / 2)],
  ['empty arguments with blanks', (n) => G + 'click a call f(' + ' '.repeat(n) + 'x'],
  ['open callback arguments', (n) => G + 'click a call f(' + 'x,'.repeat(n / 2)],
  ['long click ids', (n) => G + 'click ' + 'a,'.repeat(n / 2)],
  ['a long task text', (n) => G + 'a '.repeat(n / 2) + ':1d'],
  ['long task data', (n) => G + 'a :' + 'x, '.repeat(n / 3)],
  ['colons', (n) => G + ':'.repeat(n)],
  ['colons and hashes', (n) => G + ':#'.repeat(n / 2)],
  ['percent comments', (n) => G + 'x%\n'.repeat(n / 3)],
  ['single percents', (n) => G + '%\n'.repeat(n / 2)],
  ['dates', (n) => G + '2020-01-01'.repeat(n / 10)],
  ['entities', (n) => G + 'a :' + '#a;'.repeat(n / 3)],
  ['lines split by comment lines', (n) => G + 'a :1d\n%% c\n'.repeat(n / 12)],
  ['CRLF lines', (n) => G + 'a :1d\r\n'.repeat(n / 7)],
  // A dropped `;` and many removed spans: each token's text is read across the cut text (at 16x
  // size, where a walk over every run per token shows).
  [
    'a style line, then CRLF lines split by comment lines',
    (n) => G + 'style a:#f;\r\n' + 'a :1d\r\n%% c\r\n'.repeat(n),
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

describe('stress: the gantt lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      ganttTokens(small); // warm up
      ganttTokens(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => ganttTokens(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => ganttTokens(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
