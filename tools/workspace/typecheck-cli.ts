/**
 * `pnpm typecheck` (`typecheck.ts`): `typecheck-cli.ts [tsconfig…]`. The given configs (from
 * the workspace root) and every config the packages' `typecheck` scripts name are checked,
 * configs with identical compiler options as one program. Groups run in parallel (`parallel.ts`),
 * the largest first, one process each; every group runs even after a failure, and the exit
 * code is 1 when any failed.
 */
import { availableParallelism } from 'node:os';
import { join, relative } from 'node:path';
import { ROOT } from './diagrams.ts';
import { printResult, runAll, type Task } from './parallel.ts';
import { planTypecheck, SPLIT_EXIT } from './typecheck.ts';

const plan = planTypecheck(ROOT, process.argv.slice(2));
const pretty = process.stdout.isTTY ? ['--pretty'] : [];
const worker = join(import.meta.dirname, 'typecheck-worker.ts');
const check = (configs: readonly string[]): Task => ({
  label:
    relative(ROOT, configs[0]!) +
    (configs.length > 1 ? ` and ${configs.length - 1} more with the same options` : ''),
  command: process.execPath,
  nice: true,
  args: [
    ...process.execArgv,
    worker,
    ...pretty,
    ...(configs.length > 1 ? ['--split'] : []),
    ...configs,
  ],
});
const tasks: Task[] = [
  ...plan.groups.map((group) => check(group.configs)),
  ...plan.scripts.map((s) => ({
    label: `${relative(ROOT, s.dir)}: ${s.script}`,
    command: 'pnpm',
    args: ['--dir', s.dir, 'run', 'typecheck'],
    nice: true,
  })),
];

// A group that has to be checked one member at a time comes back split, and its members run in
// parallel like any other task.
// Half the cores, at a lower priority: `pnpm check` runs this beside ESLint and the unit tests,
// and each program takes one to two gigabytes.
const results = await runAll(tasks, {
  cwd: ROOT,
  lanes: Math.max(2, Math.round(availableParallelism() / 2)),
  onDone: (result) => {
    if (result.code === SPLIT_EXIT) {
      const configs = result.task.args.slice(result.task.args.indexOf('--split') + 1);
      return configs.map((config) => check([config]));
    }
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
