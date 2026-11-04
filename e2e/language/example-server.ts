/**
 * Builds a language-service example editor (`packages/language-service/examples/<name>`) with
 * `vite build` into a temporary directory and serves the build with `vite preview` on a free
 * port. Serving the production build is the point: it proves the example, and the service's
 * optional-peer facet import, bundle in Vite (GAPS, #31).
 *
 *     const example = await startExample('codemirror');
 *     await page.goto(example.origin);
 *     await example.close();
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

export interface ExampleServer {
  /** e.g. `http://localhost:54321`. */
  readonly origin: string;
  close(): Promise<void>;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001B\[[0-9;]*m/g;

export async function startExample(name: string): Promise<ExampleServer> {
  const pkg = `@mermaid-js/example-${name}`;
  const outDir = mkdtempSync(join(tmpdir(), `example-${name}-`));
  execFileSync('pnpm', ['--filter', pkg, 'exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: REPO_ROOT,
    stdio: 'pipe',
  });
  const child = spawn(
    'pnpm',
    ['--filter', pkg, 'exec', 'vite', 'preview', '--outDir', outDir, '--port', '0', '--host', 'localhost'],
    { cwd: REPO_ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let output = '';
  const origin = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`vite preview did not start:\n${output}`)), 60_000);
    const onData = (chunk: Buffer): void => {
      output += chunk.toString().replace(ANSI, '');
      const found = /(http:\/\/localhost:\d+)/.exec(output);
      if (found) {
        clearTimeout(timer);
        resolve(found[1]);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => reject(new Error(`vite preview exited (${code}):\n${output}`)));
  });
  return {
    origin,
    async close() {
      // A child that has already exited (vite crashed) has nothing left to wait for.
      if (child.exitCode === null && child.signalCode === null) {
        const exited = new Promise((done) => child.once('exit', done));
        // pnpm runs vite in a child; signal the whole group.
        if (child.pid !== undefined) process.kill(-child.pid, 'SIGTERM');
        await exited;
      }
      rmSync(outDir, { recursive: true, force: true });
    },
  };
}
