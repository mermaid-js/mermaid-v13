/**
 * What core's `maxLayoutWork` default costs on this machine (D542): gantt's scheduling walked to
 * `MAX_STEPS` in the slowest shapes found (a sparse exclude, so no day is pushed and the walk
 * runs the whole span, in four date formats). Run it on the CI runner to check that the default
 * stays near a second: `pnpm --filter @mermaid-js/diagram-gantt bench:steps`.
 */
import { MAX_STEPS } from '@mermaid-js/core/limits';
import { parseGantt, schedule } from '../src/index.ts';

const SHAPES: readonly (readonly [format: string, start: string])[] = [
  ['YYYY-MM-DD', '2000-01-01'],
  ['DD/MM/YYYY', '01/01/2000'],
  ['YYYY-MM-DD HH:mm:ss', '2000-01-01 00:00:00'],
  ['MMMM Do YYYY dddd', 'January 1st 2000 Saturday'],
];
const ROUNDS = 5;

let worst = 0;
for (const [format, start] of SHAPES) {
  const { model } = parseGantt(`gantt\ndateFormat ${format}\nexcludes x\na :a, ${start}, 9000y`);
  let best = Infinity;
  for (let r = 0; r < ROUNDS; r++) {
    const t0 = performance.now();
    try {
      schedule(model, { now: 0 });
    } catch {
      // The limit stops it: that is the cost measured.
    }
    best = Math.min(best, performance.now() - t0);
  }
  worst = Math.max(worst, best);
  const perStep = (best * 1e6) / MAX_STEPS;
  process.stdout.write(
    `${format.padEnd(20)} ${best.toFixed(0)} ms to MAX_STEPS (${perStep.toFixed(0)} ns/step)\n`
  );
}
process.stdout.write(
  `MAX_STEPS ${MAX_STEPS}: worst ${worst.toFixed(0)} ms (best of ${ROUNDS} each)\n`
);
