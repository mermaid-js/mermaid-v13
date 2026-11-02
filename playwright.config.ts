import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

function resolveE2EPort(): string {
  if (process.env.MERMAID_PORT) {
    return process.env.MERMAID_PORT;
  }
  if (process.env.CI) {
    return '9000';
  }
  if (process.env.MERMAID_DEV_PORT) {
    return process.env.MERMAID_DEV_PORT;
  }
  const worktreeRoot = process.cwd();
  if (basename(worktreeRoot) === 'alana-mermaid') {
    return '9000';
  }
  const hash = createHash('sha1').update(worktreeRoot).digest();
  return String(9000 + (hash.readUInt16BE(0) % 100));
}

const port = resolveE2EPort();
process.env.MERMAID_PORT ??= port;
process.env.MERMAID_DEV_PORT ??= port;

// The v13 page server (packages/dev, the same server as `pnpm dev`): bundles the browser
// adapter and serves e2e.html.
const devCommand = 'pnpm --filter @mermaid-js/dev serve';

export default defineConfig({
  testDir: 'e2e',
  // v13 runs the .mmd fixtures of the diagram types it has packages for (R-TEST-5), the
  // browser adapter and dev specs. The other specs under e2e/ are the parked v12 suite.
  testMatch: [
    'rendering/mmd-snapshots.spec.ts',
    'browser/**/*.spec.ts',
    'dev/**/*.spec.ts',
    'smoke/**/*.spec.ts',
  ],
  // e2e/helpers holds Vitest unit tests for the e2e helpers; Playwright must not collect them.
  testIgnore: '**/helpers/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
  // 'github' emits ::error:: file/line annotations; 'line' adds newline-flushed
  // progress so CI logs stream per-test instead of buffering like 'dot'.
  reporter: process.env.CI ? [['github'], ['line']] : [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 1024 },
    // Fixed rather than inherited from the host: historical timezone offsets
    // aren't whole hours, so a mocked ancient test date (e.g. gantt's
    // 1010-10-10) can resolve to an odd sub-hour offset that varies by
    // machine — and isn't avoided by using an explicit Z-suffixed clock
    // value, since dayjs's own date defaulting still resolves through it.
    timezoneId: 'UTC',
    // Render at 2x device pixels so diagram screenshots have enough resolution to
    // stay sharp when the Argos grid enlarges them to fill a cell.
    deviceScaleFactor: 2,
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // The baseline and browser specs; the smoke render needs the bundle (`smoke:build`).
    { name: 'chromium', testIgnore: ['**/helpers/**', 'smoke/**'] },
    // CI smoke-render, one runtime per job: `--project smoke-<browser>`.
    ...(['chromium', 'firefox', 'webkit'] as const).map((browser) => ({
      name: `smoke-${browser}`,
      testMatch: 'smoke/**/*.spec.ts',
      use: {
        ...devices[
          browser === 'chromium'
            ? 'Desktop Chrome'
            : browser === 'firefox'
              ? 'Desktop Firefox'
              : 'Desktop Safari'
        ],
        deviceScaleFactor: browser === 'firefox' ? 1 : 2,
      },
    })),
  ],
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{ext}',
  webServer: {
    command: devCommand,
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      MERMAID_PORT: port,
      MERMAID_DEV_PORT: port,
    },
  },
});
