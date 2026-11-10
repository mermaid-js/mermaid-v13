import { describe, expect, it } from 'vitest';
import { parseBlock, type BlockModel } from '@mermaid-js/diagram-block';
import { drawBlockText } from '@mermaid-js/diagram-block/testing';

/**
 * The block text drawing (#559, D449) is linear in blocks and edges, pitfall 5: the text grid,
 * the router and the canvas. Shape from `../packet/stress.spec.ts` (#531): n and 8n units,
 * linear is ~8x, quadratic ~64x, and the bar is 24x. Times are this thread's CPU time, best of
 * five, small and large drawings alternating; the small drawing repeats until it takes at
 * least {@link MIN_MS}, ten steps of the CPU clock or more, and the large one an eighth as
 * often, so the bar is a ratio of per-drawing times well above the clock's step. Edges join
 * neighbours: a route's search is bounded to a window around its two boxes, so its cost does
 * not grow with the drawing. Not measured on a steady machine: the bar is a ratio.
 */
const B = 'block\n';
const ids = (n: number) => Array.from({ length: n }, (_, k) => `b${k}`);
/** `n` statements, one a line, each with ids of its own. */
const each = (n: number, line: (k: number) => string) =>
  Array.from({ length: n }, (_, k) => line(k)).join('\n') + '\n';

const SHAPES: [string, (n: number) => string][] = [
  ['blocks on a grid', (n) => B + 'columns 10\n' + ids(n).join(' ') + '\n'],
  ['blocks in one row', (n) => B + ids(n).join(' ') + '\n'],
  [
    'spans and spaces',
    (n) => B + 'columns 7\n' + each(n / 4, (k) => `a${k} b${k}:3 c${k}:2 space`),
  ],
  [
    'composites side by side',
    (n) => B + 'columns 5\n' + each(n / 2, (k) => `block\na${k} b${k}\nend`),
  ],
  [
    'labelled composites in composites',
    (n) =>
      B + 'columns 4\n' + each(n / 4, (k) => `block:g${k}["Group"]\nblock\na${k}\nend\nb${k}\nend`),
  ],
  [
    'edges between neighbours',
    (n) =>
      B +
      'columns 10\n' +
      ids(n).join(' ') +
      '\n' +
      ids(n - 1)
        .map((id, k) => `${id} ${k % 5 === 0 ? '-- "go" -->' : '-->'} b${k + 1}`)
        .join('\n'),
  ],
];

/** CPU ms of this thread (the process on Node versions without threadCpuUsage). */
const cpuMs = (): number => {
  const u =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return (u.user + u.system) / 1000;
};
/** CPU ms of `reps` runs of `run`. */
const cost = (run: () => unknown, reps: number): number => {
  const t0 = cpuMs();
  for (let k = 0; k < reps; k++) run();
  return cpuMs() - t0;
};
/** The step of {@link cpuMs}: the median of 20 changes seen while spinning. */
const clockStepMs = (): number => {
  const steps: number[] = [];
  let last = cpuMs();
  while (steps.length < 20) {
    const now = cpuMs();
    if (now !== last) steps.push(now - last);
    last = now;
  }
  return steps.sort((a, b) => a - b)[10]!;
};
/** The shortest small measurement: 8 ms, or ten clock steps where the clock is coarser. */
const MIN_MS = Math.max(8, 10 * clockStepMs());
/** How many runs of `run` take at least {@link MIN_MS}, in each of three samples. */
const repeatsFor = (run: () => unknown): number => {
  let reps = 1;
  while (![0, 1, 2].every(() => cost(run, reps) >= MIN_MS)) reps *= 2;
  return reps;
};

const LIMITS = { maxNodes: 1e9, maxEdges: 1e9, maxDepth: 1e9 };
const model = (src: string): BlockModel => {
  const parsed = parseBlock(src, LIMITS);
  expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return parsed.model;
};
const CTX = { config: { ascii: {} } as never, warn: () => {} };

describe('stress: the block text drawing is linear in blocks and edges', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = model(build(200));
      const large = model(build(1600));
      const draw = (m: BlockModel) => drawBlockText(m, CTX);
      // Every neighbour gets its route: the drawing is not cut short by forced edges.
      expect(draw(large).forced).toEqual([]);
      const reps = repeatsFor(() => draw(small));
      const repsLarge = Math.max(1, reps / 8);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => draw(small), reps)
        );
        tLarge = Math.min(
          tLarge,
          cost(() => draw(large), repsLarge)
        );
      }
      // A reading of 0 means the clock did not move: a broken measurement, not a fast drawing.
      expect(tSmall, `${reps} small runs read 0 ms (MIN_MS ${MIN_MS})`).toBeGreaterThan(0);
      expect(tLarge / repsLarge / (tSmall / reps)).toBeLessThan(24);
    },
    60_000
  );
});
