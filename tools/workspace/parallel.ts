/**
 * Running processes side by side, for the check scripts (`pnpm lint`, `pnpm check:static`)
 * and the pre-push hook (`tools/pre-push/cli.ts`). Every command runs to the end, even after
 * another failed; each one's output is kept in one piece, so outputs do not interleave. A
 * caller fails when any command failed, so running in parallel never hides one.
 */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';

export interface Finished {
  /** The exit code; null when the command could not start or was killed by a signal. */
  readonly code: number | null;
  /** The signal that killed it, if one did. */
  readonly signal: NodeJS.Signals | null;
  /** stdout and stderr, in the order they arrived, then the reason it could not start. */
  readonly output: string;
}

/** How long a command's output may stay open after its process exited. */
const DRAIN_MS = 2000;

/**
 * Runs one command and resolves with its exit code and output. It resolves when the process
 * exits: its output normally closes right after, but a grandchild that outlives it may hold the
 * pipes open, so reading stops {@link DRAIN_MS} later.
 */
export function runProcess(
  command: string,
  args: readonly string[],
  { cwd, env = process.env }: { readonly cwd: string; readonly env?: NodeJS.ProcessEnv }
): Promise<Finished> {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));
    let finished = false;
    const finish = (code: number | null, signal: NodeJS.Signals | null, extra = '') => {
      if (finished) return;
      finished = true;
      done({ code, signal, output: Buffer.concat(chunks).toString() + extra });
    };
    child.on('error', (error) => finish(null, null, `${error.message}\n`));
    child.on('exit', (code, signal) => {
      const drained = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish(code, signal);
      }, DRAIN_MS);
      child.on('close', () => {
        clearTimeout(drained);
        finish(code, signal);
      });
    });
  });
}

/** Runs `task` over `items`, at most `limit` at a time; the results keep the items' order. */
export async function pool<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

export interface Task {
  /** What the summary line calls it. */
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
}

export interface TaskResult extends Finished {
  readonly task: Task;
  readonly ok: boolean;
  readonly seconds: number;
}

export interface RunOptions {
  readonly cwd: string;
  /** How many commands run at once. Defaults to the core count. */
  readonly lanes?: number;
  /** Called as each command ends, in the order they end. */
  readonly onDone?: (result: TaskResult) => void;
}

/** Runs the tasks, at most `lanes` at a time, in the order given; resolves with every result. */
export function runAll(tasks: readonly Task[], options: RunOptions): Promise<TaskResult[]> {
  return pool(tasks, options.lanes ?? availableParallelism(), async (task) => {
    const start = performance.now();
    const finished = await runProcess(task.command, task.args, { cwd: options.cwd });
    const result = {
      ...finished,
      task,
      ok: finished.code === 0,
      seconds: (performance.now() - start) / 1000,
    };
    options.onDone?.(result);
    return result;
  });
}

/** Prints a result as `runAll`'s callers do: a status line, then the output if any. */
export function printResult(
  result: TaskResult,
  write: (s: string) => unknown = (s) => process.stdout.write(s)
): void {
  const status = result.ok ? 'ok    ' : 'FAILED';
  write(`${status} ${result.task.label} (${result.seconds.toFixed(1)} s)\n`);
  if (result.output.trim() !== '') write(`${result.output.trimEnd()}\n`);
}

const PARALLEL_CLI = 'tsx tools/workspace/parallel-cli.ts';

/**
 * The steps of a script that runs them with `parallel-cli.ts`, each quoted in single quotes
 * (`pnpm check:static`), or of a plain `a && b` chain.
 */
export function staticSteps(script: string): string[] {
  if (!script.startsWith(`${PARALLEL_CLI} `)) return script.split('&&').map((s) => s.trim());
  const steps = [...script.slice(PARALLEL_CLI.length).matchAll(/\s+'([^']*)'/g)].map((m) => m[1]!);
  const rebuilt = `${PARALLEL_CLI}${steps.map((s) => ` '${s}'`).join('')}`;
  if (rebuilt !== script) throw new Error(`cannot read the steps of \`${script}\``);
  return steps;
}

/**
 * How many steps `parallel-cli.ts` runs at once: all of them, but one at a time under CI,
 * where `pnpm check` runs on small runners (release-alpha.yml: 4 vCPUs) and the generated-files
 * check runs a vitest spec with a 10 s hook timeout.
 */
export function stepLanes(
  count: number,
  env: Readonly<Record<string, string | undefined>>
): number {
  const ci = env.CI !== undefined && !['', '0', 'false'].includes(env.CI);
  return ci ? 1 : count;
}
