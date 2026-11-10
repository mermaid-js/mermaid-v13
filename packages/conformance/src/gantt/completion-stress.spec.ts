import { describe, expect, it } from 'vitest';
import { ganttLanguage } from '@mermaid-js/diagram-gantt/language';
import { linearRatio } from '../linear-time.ts';

/**
 * R-LANG-4 (#382 review): gantt completion is linear in the number of tasks, and a statement
 * completion costs less than a parse of the document (it does not lex the document again per
 * item). n and 8n tasks: linear is ~8x, quadratic ~64x, and the bar is 24x, as in
 * `stress.spec.ts` and timed by `linearRatio` (../linear-time.ts). Times are this thread's CPU
 * time; the probe parse is not timed.
 */
const cpuMs = (): number => {
  const u =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return (u.user + u.system) / 1000;
};
const cost = (run: () => unknown): number => {
  let best = Infinity;
  for (let round = 0; round < 5; round++) {
    const t0 = cpuMs();
    run();
    best = Math.min(best, cpuMs() - t0);
  }
  return best;
};

/** `n` tasks with distinct ids, then `tail` with the cursor at its end. */
function chart(n: number, tail: string): string {
  let text = 'gantt\n  dateFormat YYYY-MM-DD\n';
  for (let i = 0; i < n; i++) text += `  Task ${i} :t${i}, 2024-01-01, 1d\n`;
  return text + tail;
}

/** Completion at the end of `text`, given the probe parse (not timed). */
function completer(text: string): () => unknown {
  const result = ganttLanguage.parse(text, { keepTokens: true, probe: text.length });
  return () => ganttLanguage.completions(result.probe!, { text, result });
}

const TAILS: [string, string][] = [
  ['task ids after `after`', '  Ship :after '],
  ['task ids after `until`', '  Ship :s1, 2024-01-01, until '],
  ['task ids in a click', '  click '],
  ['statements at a line start', '  '],
];

describe('stress: gantt completion is linear in the number of tasks', () => {
  it.each(TAILS)(
    '%s',
    (_name, tail) => {
      const small = completer(chart(1_000, tail));
      const large = completer(chart(8_000, tail));
      expect(linearRatio(small, large)).toBeLessThan(24);
    },
    60_000
  );

  it('a statement completion costs less than a parse of the document', () => {
    const text = chart(8_000, '  ');
    const complete = completer(text);
    complete();
    const parse = cost(() => ganttLanguage.parse(text, { keepTokens: true }));
    expect(cost(complete)).toBeLessThan(parse);
  }, 60_000);
});
