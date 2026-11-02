/**
 * Re-applies the gates to a saved report, e.g. after storing a baseline:
 *
 *   pnpm --filter @mermaid-js/bench gates [dist/reports/latest.json] [--mode auto|report|enforce] [--update-baseline]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BenchReport } from '../report.ts';
import { parseArgs } from './args.ts';
import { REPORTS_DIR, gate, modeSetting, publish } from './output.ts';

const args = parseArgs(process.argv.slice(2));
const path = args.positional[0] ?? join(REPORTS_DIR, 'latest.json');
const report = JSON.parse(readFileSync(path, 'utf8')) as BenchReport;
const outcome = gate(report, modeSetting(args.get('mode')));
publish(report, outcome, { updateBaseline: args.flag('update-baseline'), write: false });
process.exitCode = outcome.exitCode;
