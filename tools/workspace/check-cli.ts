/**
 * `pnpm check`: the phases of {@link checkPhases}, one after another, each phase's commands
 * side by side (`parallel.ts`). A phase starts only when the one before it passed. A phase of
 * one command streams its output, as the old `pnpm check:static && pnpm test` chain did.
 */
import { spawnSync } from 'node:child_process';
import { ROOT } from './diagrams.ts';
import { checkPhases, printResult, runAll } from './parallel.ts';

let failed = false;
for (const phase of checkPhases(process.env)) {
  if (phase.length === 1) {
    failed = spawnSync(phase[0]!, { cwd: ROOT, shell: true, stdio: 'inherit' }).status !== 0;
  } else {
    const results = await runAll(
      phase.map((command) => ({ label: command, command: 'sh', args: ['-c', command] })),
      { cwd: ROOT, lanes: phase.length, onDone: printResult }
    );
    const failures = results.filter((r) => !r.ok).map((r) => r.task.label);
    if (failures.length > 0) process.stdout.write(`failed: ${failures.join(', ')}\n`);
    failed = failures.length > 0;
  }
  if (failed) break;
}
if (failed) process.exitCode = 1;
