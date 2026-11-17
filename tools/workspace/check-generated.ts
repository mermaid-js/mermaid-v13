/**
 * `pnpm check:static`'s generated-files check (#694): every step of the root `pnpm regen`
 * script has a check here that fails when the step would change a tracked file, so an edit to
 * a generator's input without a regen fails `pnpm check` (locally it runs beside the unit
 * tests; under CI before them). The steps are read from the `regen` script itself; a step
 * with no entry in {@link CHECKS} is an error, so a new regen step cannot land without its
 * check.
 */
import { spawnSync } from 'node:child_process';
import { ROOT } from './diagrams.ts';

/**
 * Regen step → the command that fails when the step's files are stale. Each generator's
 * `--check` computes its files and compares them with the tree; the goldens step is the same
 * spec without `-u` (the CLI runs it with `CI` set, so a missing golden fails instead of
 * being written).
 */
const CHECKS: Readonly<Record<string, string>> = {
  'tsx tools/workspace/sync-cli.ts': 'tsx tools/workspace/sync-cli.ts --check',
  'pnpm gen:registry': 'pnpm gen:registry --check',
  'pnpm gen:config': 'pnpm check:config',
  'pnpm gen:theme': 'pnpm gen:theme --check',
  'pnpm gen:grammar': 'pnpm check:grammar',
  'pnpm -r --filter "./packages/language-service-*" run gen':
    'pnpm -r --filter "./packages/language-service-*" run gen --check',
  'vitest run packages/language-service/src/goldens.spec.ts -t no-diagram -u':
    'vitest run packages/language-service/src/goldens.spec.ts -t no-diagram',
};

/**
 * Steps with nothing to check here: `pnpm install` rewrites `pnpm-lock.yaml` after the
 * workspace sync, and CI's `pnpm install --frozen-lockfile` already fails on a stale lockfile.
 */
export const UNCHECKED_STEPS: ReadonlySet<string> = new Set(['pnpm install']);

export interface RegenCheck {
  /** The step as the `regen` script spells it: the command that fixes a failure. */
  readonly step: string;
  readonly check: string;
}

/** The steps of a `regen` script, in order. */
export const regenSteps = (regen: string): string[] => regen.split('&&').map((s) => s.trim());

/** The check for every step of `regen`, in order. Throws on a step with no check. */
export function regenChecks(regen: string): RegenCheck[] {
  return regenSteps(regen)
    .filter((step) => !UNCHECKED_STEPS.has(step))
    .map((step) => {
      const check = CHECKS[step];
      if (check === undefined)
        throw new Error(
          `\`pnpm regen\` step \`${step}\` has no check: add one to tools/workspace/check-generated.ts`
        );
      return { step, check };
    });
}

/** Runs a check command from the workspace root, its output passed through. True on exit 0. */
export function runCommand(command: string): boolean {
  const result = spawnSync(command, {
    cwd: ROOT,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, CI: process.env.CI ?? 'true' },
  });
  return result.status === 0;
}

/** Runs every check (none is skipped after a failure) and returns the ones that failed. */
export function checkGenerated(
  regen: string,
  run: (command: string) => boolean = runCommand
): RegenCheck[] {
  return regenChecks(regen).filter(({ check }) => !run(check));
}

/** The closing message: each stale step and the command that regenerates it. */
export function report(failures: readonly RegenCheck[]): string {
  if (failures.length === 0) return '';
  return (
    'Generated files are stale. Run the step that writes them and commit the result:\n' +
    failures.map(({ step }) => `  \`${step}\`\n`).join('') +
    'or run `pnpm regen` for every step.\n'
  );
}
