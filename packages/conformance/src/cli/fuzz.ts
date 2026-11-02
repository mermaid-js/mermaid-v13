/**
 * The nightly fuzz run (R-SEC-7). Environment:
 * - `FUZZ_SEED`: the seed (default: the current time, printed first so a run can be repeated)
 * - `FUZZ`: mutated inputs (default 20,000)
 * - `FUZZ_CASE`: run only this case of the seed's sequence (reproduce one failure)
 * - `FUZZ_REPORT`: write the JSON report here
 * - `FUZZ_CURRENT`: before each case, write `{seed, index, source}` here, so a run killed by
 *   a real hang (the job timeout) still names its input
 *
 * Exits 1 when any case failed. Usage: `pnpm --filter @mermaid-js/conformance fuzz`.
 */
import { writeFileSync } from 'node:fs';
import { formatFailure, fuzzFlowchart } from '../fuzz/run.ts';

const env = process.env;
const seed = env.FUZZ_SEED ? Number(env.FUZZ_SEED) : Date.now() % 2_147_483_647;
if (!Number.isInteger(seed))
  throw new TypeError(`FUZZ_SEED must be an integer, got ${env.FUZZ_SEED}`);
const count = Number(env.FUZZ ?? 20_000);
const only = env.FUZZ_CASE === undefined ? undefined : Number(env.FUZZ_CASE);
process.stdout.write(
  `fuzz: seed ${seed}, ${only === undefined ? `${count} inputs` : `case ${only}`}\n`
);

const started = performance.now();
const report = await fuzzFlowchart({
  seed,
  count,
  only,
  onCase: env.FUZZ_CURRENT
    ? (index, source) => writeFileSync(env.FUZZ_CURRENT!, JSON.stringify({ seed, index, source }))
    : undefined,
});
const seconds = ((performance.now() - started) / 1000).toFixed(1);
process.stdout.write(
  `fuzz: ${report.count} inputs in ${seconds} s, ${JSON.stringify(report.outcomes)}, ${report.failures.length} failures\n`
);
for (const f of report.failures) process.stdout.write(formatFailure(f) + '\n');
if (env.FUZZ_REPORT) writeFileSync(env.FUZZ_REPORT, JSON.stringify(report, null, 2) + '\n');
process.exitCode = report.failures.length > 0 ? 1 : 0;
