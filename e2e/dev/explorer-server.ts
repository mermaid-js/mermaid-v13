/**
 * A second dev server over a temporary explorer root, for specs that write `.mmd` files
 * (live reload, saving, creating). The shared Playwright server stays on `e2e/diagrams`, which
 * specs only read. Spawns `pnpm --filter @mermaid-js/dev serve` on a free port.
 *
 *     const explorer = await startExplorerServer({ 'a/one.mmd': 'flowchart LR\n  A' });
 *     await page.goto(explorer.url('a/one.mmd'));
 *     writeFileSync(explorer.path('a/one.mmd'), '…');
 *     await explorer.close();
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

export interface ExplorerServer {
  /** e.g. `http://localhost:54321`. */
  readonly origin: string;
  readonly root: string;
  /** The absolute path of a root-relative file. */
  path(file: string): string;
  /** The explorer URL that opens `file` (or the root listing without one). */
  url(file?: string): string;
  close(): Promise<void>;
}

export async function startExplorerServer(
  files: Readonly<Record<string, string>> = {}
): Promise<ExplorerServer> {
  const root = mkdtempSync(join(tmpdir(), 'dev-explorer-e2e-'));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  const child = spawn('pnpm', ['--filter', '@mermaid-js/dev', 'serve'], {
    cwd: REPO_ROOT,
    env: { ...process.env, MERMAID_PORT: '0', MERMAID_DEV_EXPLORER_ROOT: root },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const origin = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`dev server did not start:\n${output}`)), 90_000);
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      const found = /e2e pages at (http:\/\/localhost:\d+)/.exec(output);
      if (found) {
        clearTimeout(timer);
        resolve(found[1]);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => reject(new Error(`dev server exited (${code}):\n${output}`)));
  });
  return {
    origin,
    root,
    path: (file) => join(root, file),
    url: (file) => {
      if (!file) return `${origin}/dev/`;
      const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
      const params = new URLSearchParams({ ...(dir ? { path: dir } : {}), file });
      return `${origin}/dev/?${params}`;
    },
    async close() {
      const exited = new Promise((done) => child.once('exit', done));
      // pnpm runs tsx in a child; signal the whole group.
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGTERM');
      await exited;
      rmSync(root, { recursive: true, force: true });
    },
  };
}
