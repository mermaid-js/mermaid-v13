/**
 * One group of `pnpm typecheck` (`typecheck.ts`), in a process of its own:
 * `typecheck-worker.ts [--pretty] [--split] <tsconfig>…`. Prints the diagnostics and exits 1 on
 * an error. With `--split`, a group whose members must be checked one at a time is not
 * checked: the worker exits with {@link SPLIT_EXIT}, and the caller runs each member alone.
 */
import { checkConfigs, formatDiagnostics, SPLIT_EXIT } from './typecheck.ts';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const result = checkConfigs(
  args.filter((a) => !a.startsWith('--')),
  { split: flag('--split') }
);
if (result.split) process.exitCode = SPLIT_EXIT;
else {
  if (result.diagnostics.length > 0)
    process.stdout.write(formatDiagnostics(result.diagnostics, flag('--pretty')));
  if (result.errors.length > 0) process.exitCode = 1;
}
