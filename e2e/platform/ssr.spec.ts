/**
 * The Node SSR app (spec #218, T4; R-PLUG-5, D165): `mermaid` and the fixture plugins are
 * packed, installed into a copy of `e2e/platform/ssr/` (npm and pnpm) and served by the app's
 * own Node server, which renders on the server and never registers a plugin. Node discovery
 * finds the fixture diagram and extension, `@mermaid-js/layout-elk` (#243) and
 * `@mermaid-js/plugin-hand-drawn` (#343, its "activates on install"); `DISCOVERY=off` (`discovery: false`) turns it off.
 * The bundled variant (esbuild, `--platform=node`) runs from `dist/server/`, below type-marker
 * package.json files: discovery still finds the app root, imports the plugins at runtime and
 * leaves npm's hoisted first-party packages out.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { installApp } from './harness/index.ts';
import type { PackageManager } from './harness/index.ts';

test.describe.configure({ timeout: 180_000 });

interface Server {
  readonly origin: string;
  close(): void;
}

/**
 * Starts the app's server (`server.mjs` in `dir`, which is also its cwd) and resolves with its
 * origin once it prints `listening <origin>`.
 */
function start(dir: string, env: Record<string, string> = {}): Promise<Server> {
  const child: ChildProcess = spawn(process.execPath, ['server.mjs'], {
    cwd: dir,
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

const variants: [string, PackageManager, boolean][] = [
  ['npm', 'npm', false],
  ['pnpm', 'pnpm', false],
  ['npm, bundled server', 'npm', true],
];

for (const [name, manager, bundled] of variants) {
  test(`the SSR app renders discovered plugins with no registration code (${name})`, async ({
    page,
  }) => {
    const app = installApp('ssr', { manager, ...(bundled ? { build: 'build:bundle' } : {}) });
    const server = await start(bundled ? join(app.dir, 'dist', 'server') : app.dir);
    try {
      await page.goto(`${server.origin}/`);
      // The fixture diagram: detector from its manifest, entry loaded on first detection.
      await expect(page.locator('#fixture svg.fixturebox text')).toHaveText('from the server');
      // The fixture extension's postRender hook ran on every render, the flowchart's too.
      await expect(page.locator('#fixture svg.fixture-mark')).toHaveCount(1);
      await expect(page.locator('#flowchart svg.fixture-mark [data-id="A"]')).toHaveCount(1);
      // Nothing skipped: mermaid's own packages (hoisted by npm) are not discovered.
      await expect(page.locator('#fixture')).toHaveAttribute('data-warnings', '');
      // @mermaid-js/layout-elk by its `layout` manifest (D171): ELK lays it out (no
      // ELK_NOT_INSTALLED), and the extension from its config module draws a lineHops arc.
      await expect(page.locator('#elk')).toHaveAttribute('data-warnings', '');
      await expect(page.locator('#elk svg g.edge path[d*="A6,6"]')).toHaveCount(1);
      // @mermaid-js/plugin-hand-drawn by its `extension` manifest (D300): `look: handDrawn` is
      // its alias (no LOOK_REMOVED), and node A's outline is roughjs's paths, not a rect.
      await expect(page.locator('#handdrawn')).toHaveAttribute('data-warnings', '');
      await expect(page.locator('#handdrawn svg [data-id="A"] rect')).toHaveCount(0);
      await expect(page.locator('#handdrawn svg [data-id="A"] > g > path')).not.toHaveCount(0);
    } finally {
      server.close();
      app.close();
    }
  });
}

test('with discovery: false the fixture type is UNSUPPORTED_DIAGRAM', async ({ page }) => {
  const app = installApp('ssr', { manager: 'pnpm' });
  const server = await start(app.dir, { DISCOVERY: 'off' });
  try {
    await page.goto(`${server.origin}/`);
    await expect(page.locator('#fixture .error')).toHaveAttribute(
      'data-code',
      'UNSUPPORTED_DIAGRAM'
    );
    await expect(page.locator('#flowchart svg [data-id="A"]')).toHaveCount(1);
    await expect(page.locator('svg.fixture-mark')).toHaveCount(0);
    await expect(page.locator('#elk')).toHaveAttribute('data-warnings', 'ELK_NOT_INSTALLED');
    await expect(page.locator('#handdrawn')).toHaveAttribute('data-warnings', 'LOOK_REMOVED');
    await expect(page.locator('#handdrawn svg [data-id="A"] rect')).toHaveCount(1);
  } finally {
    server.close();
    app.close();
  }
});
