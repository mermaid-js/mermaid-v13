/**
 * Live reload: the SSE hub behind `GET /events` and the source watcher (v12
 * `.esbuild/server.ts:118-155, 314-362`). The server wires them together: a change rebuilds,
 * then every connected page gets one event.
 */
import type { ServerResponse } from 'node:http';
import { relative, sep } from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import type { Route } from './routes.ts';

/** The data of every `/events` message: when, and which files (repo-relative, posix). */
export interface ReloadEvent {
  readonly time: number;
  readonly paths: readonly string[];
}

export interface EventHub {
  /** `GET /events`: a `text/event-stream` that stays open until the client or server leaves. */
  readonly route: Route;
  broadcast(event: ReloadEvent): void;
}

export function createEventHub(): EventHub {
  const clients = new Set<ServerResponse>();
  return {
    route: {
      path: '/events',
      method: 'GET',
      handle: (req, res) => {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        // A comment, so the client's `open` fires now rather than at the first event.
        res.write(': connected\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
      },
    },
    broadcast(event) {
      const message = `data: ${JSON.stringify(event)}\n\n`;
      for (const res of clients) res.write(message);
    },
  };
}

export interface SourceWatcher {
  close(): Promise<void>;
}

/** Files that are never sources: editor swap and backup files, dotfiles. */
const isNoise = (path: string): boolean => {
  const name = path.slice(path.lastIndexOf(sep) + 1);
  return name.startsWith('.') || name.endsWith('~') || name.endsWith('.swp');
};

/**
 * Watches every workspace package's `src/` (packages added later included), `packages/dev/www`
 * and `extra` paths. Changes within `debounceMs` of each other are reported once, with every
 * changed path (repo-relative, posix). Resolves once the initial scan is done.
 */
export async function watchSources(
  root: string,
  extra: readonly string[],
  debounceMs: number,
  onChange: (paths: readonly string[]) => void
): Promise<SourceWatcher> {
  const packages = `${root}${sep}packages`;
  const ignored = (path: string): boolean => {
    if (isNoise(path) || path.includes(`${sep}node_modules`)) return true;
    if (!path.startsWith(`${packages}${sep}`)) return false;
    // packages/<name>/<top>/…: only src (and the dev server's www) are sources.
    const [name, top] = path.slice(packages.length + 1).split(sep);
    return top !== undefined && top !== 'src' && !(name === 'dev' && top === 'www');
  };
  const watcher: FSWatcher = watch([packages, ...extra], { ignoreInitial: true, ignored });
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
  await new Promise<void>((done) => watcher.once('ready', () => done()));
  return {
    async close() {
      clearTimeout(timer);
      await watcher.close();
    },
  };
}
