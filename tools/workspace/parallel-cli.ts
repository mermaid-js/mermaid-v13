/**
 * `parallel-cli.ts <command>…`: runs shell commands side by side (`parallel.ts`), as
 * `pnpm check:static` runs its steps; under CI one at a time (`stepLanes`). Each runs to the
 * end, its output printed in one piece; the exit code is 1 when any failed, and the closing
 * line names the ones that did.
 */
import { ROOT } from './diagrams.ts';
import { printResult, runAll, stepLanes } from './parallel.ts';

const commands = process.argv.slice(2);
const results = await runAll(
  commands.map((command) => ({ label: command, command: 'sh', args: ['-c', command] })),
  { cwd: ROOT, lanes: stepLanes(commands.length, process.env), onDone: printResult }
);
const failed = results.filter((r) => !r.ok).map((r) => r.task.label);
process.stdout.write(
  failed.length === 0
    ? `all ${results.length} steps passed\n`
    : `${failed.length} of ${results.length} steps failed: ${failed.join(', ')}\n`
);
if (failed.length > 0) process.exitCode = 1;
