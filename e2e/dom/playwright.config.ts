/**
 * Playwright for the DOM adapter specs (#16: run, mount, error image, afterMount) and the
 * browser smoke render, in Chromium, Firefox and WebKit. Run with `pnpm e2e:dom`.
 */
import { defineConfig, devices } from '@playwright/test';

const port = process.env.MERMAID_DOM_PORT ?? '9300';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['line']] : [['list']],
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'pnpm exec tsx e2e/dom/server.ts',
    cwd: '../..',
    env: { MERMAID_DOM_PORT: port },
    url: `http://127.0.0.1:${port}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
});
