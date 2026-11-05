/**
 * The Node SSR app (spec #218, T4; R-PLUG-5, D165): `mermaid` and the fixture plugins are
 * packed, installed into a copy of `e2e/platform/ssr/` (npm and pnpm) and served by the app's
 * own Node server, which renders on the server and never registers a plugin. Node discovery
 * finds the fixture diagram and extension; `DISCOVERY=off` (`discovery: false`) turns it off.
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { installApp } from './harness/index.ts';
import type { InstalledApp, PackageManager } from './harness/index.ts';

test.describe.configure({ timeout: 180_000 });

interface Server {
  readonly origin: string;
  close(): void;
}

/** Starts the app's server and resolves with its origin once it prints `listening <origin>`. */
function start(app: InstalledApp, env: Record<string, string> = {}): Promise<Server> {
  const child: ChildProcess = spawn(process.execPath, ['server.mjs'], {
    cwd: app.dir,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`the SSR server did not start:\n${output}`));
    }, 20_000);
    const read = (chunk: Buffer): void => {
      output += chunk.toString();
      const m = /listening (\S+)/.exec(output);
      if (!m) return;
      clearTimeout(timer);
      resolve({ origin: m[1], close: () => void child.kill() });
    };
    child.stdout!.on('data', read);
    child.stderr!.on('data', (c: Buffer) => (output += c.toString()));
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`the SSR server exited (${String(code)}):\n${output}`));
    });
  });
}

for (const manager of ['npm', 'pnpm'] as PackageManager[]) {
  test(`the SSR app renders discovered plugins with no registration code (${manager})`, async ({
    page,
  }) => {
    const app = installApp('ssr', { manager });
    const server = await start(app);
    try {
      await page.goto(`${server.origin}/`);
      // The fixture diagram: detector from its manifest, entry loaded on first detection.
      await expect(page.locator('#fixture svg.fixturebox text')).toHaveText('from the server');
      // The fixture extension's postRender hook ran on every render, the flowchart's too.
      await expect(page.locator('#fixture svg.fixture-mark')).toHaveCount(1);
      await expect(page.locator('#flowchart svg.fixture-mark [data-id="A"]')).toHaveCount(1);
      // Nothing skipped: mermaid's own packages (hoisted by npm) are not discovered.
      await expect(page.locator('#fixture')).toHaveAttribute('data-warnings', '');
    } finally {
      server.close();
      app.close();
    }
  });
}

test('with discovery: false the fixture type is UNSUPPORTED_DIAGRAM', async ({ page }) => {
  const app = installApp('ssr', { manager: 'pnpm' });
  const server = await start(app, { DISCOVERY: 'off' });
  try {
    await page.goto(`${server.origin}/`);
    await expect(page.locator('#fixture .error')).toHaveAttribute(
      'data-code',
      'UNSUPPORTED_DIAGRAM'
    );
    await expect(page.locator('#flowchart svg [data-id="A"]')).toHaveCount(1);
    await expect(page.locator('svg.fixture-mark')).toHaveCount(0);
  } finally {
    server.close();
    app.close();
  }
});
