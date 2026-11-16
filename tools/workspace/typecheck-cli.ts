/**
 * `pnpm typecheck` (`typecheck.ts`): `typecheck-cli.ts [tsconfig…]`. The given configs (from
 * the workspace root) and every config the packages' `typecheck` scripts name are checked:
 * configs with identical compiler options as one program, every other config by a literal
 * `tsc -p`. They run in parallel (`parallel.ts`), the largest first; every one runs even after
 * a failure, and the exit code is 1 when any failed.
 */
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './diagrams.ts';
import { printResult, runAll } from './parallel.ts';
import { planTypecheck, splitTasks, typecheckTasks } from './typecheck.ts';

const plan = planTypecheck(ROOT, process.argv.slice(2));
const tools = {
  node: [process.execPath, ...process.execArgv],
  worker: join(import.meta.dirname, 'typecheck-worker.ts'),
  pretty: process.stdout.isTTY,
};
const tasks = typecheckTasks(plan, tools);

// Half the cores, at a lower priority: `pnpm check` runs this beside ESLint and the unit tests,
// and each program takes one to two gigabytes. A group that has to be checked one member at a
// time comes back split, and its members run as `tsc -p` like any other task.
const results = await runAll(tasks, {
  cwd: ROOT,
  lanes: Math.max(2, Math.round(availableParallelism() / 2)),
  onDone: (result) => {
    const members = splitTasks(result, tools);
    if (members) return members;
    printResult(result);
  },
});
const failed = results.filter((r) => !r.ok).length;
const configs = plan.groups.reduce((n, g) => n + g.configs.length, 0);
process.stdout.write(
  `typecheck: ${results.length - failed} of ${results.length} programs passed ` +
    `(${configs} tsconfigs, ${plan.scripts.length} scripts as written)\n`
);
if (failed > 0) process.exitCode = 1;
