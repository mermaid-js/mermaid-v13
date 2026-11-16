/**
 * Runs commands side by side for the check scripts (`pnpm lint`, `pnpm typecheck`,
 * `pnpm check:static`). Every command runs to the end, even after another failed; each one's
 * output is printed in one piece when it ends, so outputs do not interleave. The result is a
 * failure when any command failed, so running in parallel never hides one.
 */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';

export interface Task {
  /** What the summary line calls it. */
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  /**
   * Run at a lower scheduling priority (`nice -n 10`). For batch work that has no timeouts
   * (ESLint, tsc, Prettier): beside the unit tests in `pnpm check` it takes the cores the tests
   * leave idle instead of slowing the tests down. Alone it runs at full speed.
   */
  readonly nice?: boolean;
}

export interface TaskResult {
  readonly task: Task;
  readonly ok: boolean;
  /** The exit code; null when the command could not start or was killed. */
  readonly code: number | null;
  readonly output: string;
  readonly seconds: number;
}

export interface RunOptions {
  readonly cwd: string;
  /** How many commands run at once; at least 1. Defaults to the core count. */
  readonly lanes?: number;
  /**
   * Called as each command ends, in the order they end. Tasks it returns run next, before the
   * ones still queued.
   */
  readonly onDone?: (result: TaskResult) => readonly Task[] | void;
}

function runOne(task: Task, cwd: string): Promise<TaskResult> {
  const start = performance.now();
  return new Promise((done) => {
    const [command, args] = task.nice
      ? ['nice', ['-n', '10', task.command, ...task.args]]
      : [task.command, task.args];
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...task.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const finish = (code: number | null, extra = '') =>
      done({
        task,
        ok: code === 0,
        code,
        output: output + extra,
        seconds: (performance.now() - start) / 1000,
      });
    child.on('error', (error) => finish(null, `${error.message}\n`));
    child.on('close', (code) => finish(code));
  });
}

/**
 * Runs the tasks, at most `lanes` at a time, in the order given; resolves with every result,
 * except those of tasks whose `onDone` handed back follow-up tasks instead.
 */
export function runAll(tasks: readonly Task[], options: RunOptions): Promise<TaskResult[]> {
  const queue = [...tasks];
  const results: TaskResult[] = [];
  const lanes = Math.max(1, options.lanes ?? availableParallelism());
  let running = 0;
  return new Promise((resolve) => {
    const pump = () => {
      while (running < lanes && queue.length > 0) {
        running++;
        void runOne(queue.shift()!, options.cwd).then((result) => {
          running--;
          const next = options.onDone?.(result);
          if (next) queue.unshift(...next);
          else results.push(result);
          pump();
        });
      }
      if (running === 0 && queue.length === 0) resolve(results);
    };
    pump();
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
