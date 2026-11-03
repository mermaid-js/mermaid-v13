/**
 * `pnpm dev`'s supervisor (`cli/dev.ts`): the server runs in a child process (`cli/dev-server.ts`)
 * and restarts when the server's own code changes, since a running Node process never picks up
 * edited modules. Browser code (`src/browser/`) and every other package stay live rebuilds in
 * the running server, which keeps open pages connected.
 */
import { spawn } from 'node:child_process';
import { relative, sep } from 'node:path';
import { watch } from 'chokidar';

const SERVER_SRC = 'packages/dev/src/';

/** Whether a change to `path` (repo-relative, posix) needs a server restart. */
export const restartsServer = (path: string): boolean =>
  path.startsWith(SERVER_SRC) &&
  !path.startsWith(`${SERVER_SRC}browser/`) &&
  !/\.(spec|test)\.ts$/.test(path);

export interface ServerChild {
  /** Ends the process and resolves once it has exited (its port is free again). */
  stop(): Promise<void>;
}

export interface SupervisorOptions {
  /** Starts the server process. */
  readonly start: () => ServerChild;
  /** Reports changed files (repo-relative, posix), debounced. */
  readonly watch: (onChange: (paths: readonly string[]) => void) => {
    close(): Promise<void>;
  };
  /** Prints a one-line note (the restart message). */
  readonly note: (text: string) => void;
}

export interface Supervisor {
  /** Resolves when no restart is pending. */
  idle(): Promise<void>;
  /** Stops watching and stops the server. */
  close(): Promise<void>;
}

export function superviseServer(options: SupervisorOptions): Supervisor {
  let child = options.start();
  let queue = Promise.resolve();
  const watcher = options.watch((paths) => {
    const server = paths.filter(restartsServer);
    if (server.length === 0) return;
    queue = queue.then(async () => {
      options.note(`[dev] server code changed (${server.join(', ')}); restarting the server`);
      await child.stop();
      child = options.start();
    });
  });
  return {
    idle: () => queue,
    async close() {
      await watcher.close();
      await queue;
      await child.stop();
    },
  };
}

/** In the child: exit when the supervisor's IPC channel closes (it exited or was killed). */
export function exitWithSupervisor(): void {
  if (process.send) process.once('disconnect', () => process.exit(0));
}

/** The real child: `node <execArgv> <script>`, so it gets the same tsx loader and conditions. */
export function spawnServer(script: string): ServerChild {
  // The IPC channel lets the child exit when the supervisor goes, however it goes.
  const proc = spawn(process.execPath, [...process.execArgv, script], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env: process.env,
  });
  const exited = new Promise<void>((done) => proc.once('exit', () => done()));
  return {
    async stop() {
      if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGTERM');
      await exited;
    },
  };
}

/** Watches `packages/dev/src` under `root`; changes within `debounceMs` are reported once. */
export function watchServerSources(
  root: string,
  onChange: (paths: readonly string[]) => void,
  debounceMs = 100
): { close(): Promise<void> } {
  const watcher = watch(`${root}${sep}${SERVER_SRC.split('/').join(sep)}`, {
    ignoreInitial: true,
    ignored: (path) =>
      path.includes(`${sep}node_modules`) || /(^|[/\\])\.|~$|\.swp$/.test(relative(root, path)),
  });
  const changed = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  watcher.on('all', (event, path) => {
    if (event !== 'add' && event !== 'change' && event !== 'unlink') return;
    changed.add(relative(root, path).split(sep).join('/'));
    clearTimeout(timer);
    timer = setTimeout(() => {
      const paths = [...changed].sort();
      changed.clear();
      onChange(paths);
    }, debounceMs);
  });
  return {
    async close() {
      clearTimeout(timer);
      await watcher.close();
    },
  };
}
