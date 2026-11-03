/**
 * Node side of the Node environment: one child process per renderer (own heap and JIT, like a
 * browser context per renderer), fed one fixture at a time. A fixture that times out kills the
 * process and the rest run in a fresh one, as the browser driver does with its page.
 */
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { Site } from './driver.ts';
import { NODE_RUNNER, fromReply, nodeEntry, result, unbuiltBase, versionOf } from './driver.ts';
import type { Fixture } from './fixtures.ts';
import { stripMermaidOnlyConfig } from './normalize.ts';
import type { FromRunner, NodeReady, NodeRunnerArgs, ToRunner } from './node/protocol.ts';
import type { RendererId, RendererRun } from './report.ts';
import type { RenderReply } from './runner/protocol.ts';

export interface NodeDriveOptions {
  site: Site;
  renderer: RendererId;
  fixtures: Fixture[];
  reps: number;
  budgetMs: number;
  timeoutMs: number;
  liftLimits: boolean;
  strip: boolean;
  log: (line: string) => void;
}

interface Runner {
  child: ChildProcess;
  ready: NodeReady;
  next(): Promise<RenderReply>;
}

/** Starts a child for one renderer and waits for it to load the renderer. */
function startRunner(args: NodeRunnerArgs, log: (line: string) => void): Promise<Runner> {
  // No inherited execArgv: the runner is plain bundled JS, not tsx.
  const child = fork(NODE_RUNNER, [JSON.stringify(args)], { execArgv: [], stdio: 'pipe' });
  child.stderr?.on('data', (d: Buffer) => log(`  [${args.renderer} stderr] ${String(d).trim()}`));
  const waiting: { resolve(m: FromRunner): void; reject(e: Error): void }[] = [];
  const pending: FromRunner[] = [];
  let exited: Error | undefined;
  child.on('message', (m: FromRunner) => {
    const w = waiting.shift();
    if (w) w.resolve(m);
    else pending.push(m);
  });
  child.on('exit', (code, signal) => {
    exited = new Error(`runner exited (${signal ?? `code ${code}`})`);
    for (const w of waiting.splice(0)) w.reject(exited);
  });
  const nextMessage = () =>
    new Promise<FromRunner>((resolve, reject) => {
      const m = pending.shift();
      if (m) resolve(m);
      else if (exited) reject(exited);
      else waiting.push({ resolve, reject });
    });
  return nextMessage().then(
    (m) => ({
      child,
      ready:
        m.type === 'ready' ? m.ready : { ok: false, missing: false, error: 'no ready message' },
      next: () =>
        nextMessage().then((r) =>
          r.type === 'result' ? r.reply : { ok: false, error: 'unexpected message' }
        ),
    }),
    (e: unknown) => ({
      child,
      ready: { ok: false, missing: false, error: e instanceof Error ? e.message : String(e) },
      next: () => Promise.resolve({ ok: false, error: 'runner not started' }),
    })
  );
}

/** Runs every fixture through one renderer in Node. Browser-only renderers are not passed in. */
export async function driveNode(o: NodeDriveOptions): Promise<RendererRun> {
  if (o.renderer === 'v13-base' && !o.site.base) return unbuiltBase(o.site, o.fixtures);
  const entry = nodeEntry(o.site, o.renderer);
  if (entry === undefined) throw new Error(`${o.renderer} does not run in Node`);
  const args: NodeRunnerArgs = { renderer: o.renderer, entry, liftLimits: o.liftLimits };
  const base = {
    renderer: o.renderer,
    version: o.renderer === 'v13-base' ? o.site.base!.version : versionOf(o.renderer),
    readyAtMs: null,
    size: null,
  };
  let runner = await startRunner(args, o.log);
  if (!runner.ready.ok) {
    const { missing, error } = runner.ready;
    runner.child.kill();
    o.log(`  ${o.renderer} (node): ${missing ? 'pipeline missing' : 'init failed'}: ${error}`);
    return {
      ...base,
      initMs: null,
      status: missing ? 'missing' : 'init-error',
      error,
      results: o.fixtures.map((f) => result(f, missing ? 'missing' : 'error', error)),
    };
  }
  const run: RendererRun = { ...base, initMs: runner.ready.initMs, status: 'ready', results: [] };
  try {
    for (const [i, f] of o.fixtures.entries()) {
      const source = o.strip ? stripMermaidOnlyConfig(f.source).source : f.source;
      const message: ToRunner = { type: 'render', source, reps: o.reps, budgetMs: o.budgetMs };
      runner.child.send(message);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<'timeout'>(
        (resolve) => (timer = setTimeout(() => resolve('timeout'), o.timeoutMs))
      );
      const reply = await Promise.race([
        runner.next().catch((e: unknown): RenderReply => ({ ok: false, error: String(e) })),
        timeout,
      ]);
      clearTimeout(timer);
      if (reply === 'timeout') {
        run.results.push(result(f, 'timeout', `no result within ${o.timeoutMs} ms`));
        runner.child.kill();
        runner = await startRunner(args, o.log);
      } else {
        run.results.push(fromReply(f, reply));
        // A crashed runner (out of memory, say) is replaced for the remaining fixtures.
        if (runner.child.exitCode !== null) runner = await startRunner(args, o.log);
      }
      const last = run.results[run.results.length - 1]!;
      o.log(
        `  ${o.renderer} (node) ${i + 1}/${o.fixtures.length} ${f.id}: ${last.status}${last.warmMs !== null ? ` ${last.warmMs.toFixed(3)} ms` : ''}`
      );
    }
  } finally {
    runner.child.kill();
  }
  return run;
}
