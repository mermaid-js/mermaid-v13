/**
 * Refuses the public alpha publish unless R-PERF-1…4 pass (R-REL-3). Run after a full bench:
 *
 *   pnpm release:public-gate [packages/bench/dist/reports/latest.json] [--commit <sha>]
 *
 * `--commit` defaults to GITHUB_SHA; when set, the report must have been measured on it.
 * Exit code 0: the publish may run. Exit code 1: it must not.
 */
import { parseArgs } from '../../../packages/bench/src/cli/args.ts';
import { DEFAULT_REPORT, runPublicGate } from './public-gate-run.ts';

const args = parseArgs(process.argv.slice(2));
const outcome = runPublicGate(
  args.positional[0] ?? DEFAULT_REPORT,
  args.get('commit') ?? (process.env.GITHUB_SHA || undefined)
);
process.exitCode = outcome.allowed ? 0 : 1;
