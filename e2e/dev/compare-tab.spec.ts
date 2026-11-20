/**
 * The Compare tab (#61): the v13 dev build in the left iframe, a published mermaid from the
 * CDN in the right one, both rendering the current text (unsaved edits included) with the
 * same settings; the version and the pixel diff (D) live in the URL.
 *
 * The right pane needs network (cdn.jsdelivr.net and registry.npmjs.org). Those specs pin
 * exact `mermaid@12` versions and skip, saying so, when either can't be reached. On GitHub
 * Actions the reason is also a `::warning` annotation and a line in the job summary (#64),
 * since the CI reporters don't print skip reasons.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { startExplorerServer, type ExplorerServer } from './explorer-server.ts';

const FILE = 'a/one.mmd';
const SOURCE = 'flowchart LR\n  A[Alpha] --> B[Beta]\n';
/** The pinned versions: one to start from, one to switch to. */
const PINNED = '12.0.0';
const OTHER = '12.1.0';

let explorer: ExplorerServer;
let offline = '';

test.beforeAll(async () => {
  explorer = await startExplorerServer({ [FILE]: SOURCE });
  const probes = [
    `https://cdn.jsdelivr.net/npm/mermaid@${PINNED}/dist/mermaid.esm.min.mjs`,
    'https://registry.npmjs.org/mermaid',
  ];
  for (const url of probes) {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
      if (!res.ok) offline = `${url} answered ${res.status}`;
    } catch (error) {
      offline = `${url} is unreachable (${error instanceof Error ? error.message : String(error)})`;
    }
    if (offline) break;
  }
  if (offline) announceOffline(`Offline, skipping the CDN side of the Compare tab: ${offline}`);
});

/** Makes the skip reason visible in the GitHub Actions run (once per worker). */
function announceOffline(reason: string): void {
  if (!process.env.GITHUB_ACTIONS) return;
  process.stdout.write(`::warning title=Compare tab CDN specs skipped::${reason}\n`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, `- :warning: ${reason}\n`);
}

test.afterAll(async () => {
  await explorer.close();
});

const needsNetwork = (): void => {
  test.skip(offline !== '', `Offline, skipping the CDN side of the Compare tab: ${offline}`);
};

const open = (page: Page, params: Record<string, string> = {}) =>
  page.goto(`${explorer.url(FILE)}&${new URLSearchParams({ tab: 'compare', ...params })}`);
const pane = (page: Page, side: 'left' | 'right') =>
  page.locator(`dev-tab-compare .pane[data-side="${side}"]`);
const frame = (page: Page, side: 'left' | 'right') =>
  page.locator(`dev-tab-compare iframe[data-side="${side}"]`).contentFrame();
const svg = (page: Page, side: 'left' | 'right') => frame(page, side).locator('#svg-host svg');
const overlay = (page: Page) => frame(page, 'right').locator('#overlay');
const setText = (page: Page, text: string) =>
  page
    .locator('dev-tab-compare')
    .evaluate((el, t) => (el as unknown as { ctx: { setText(t: string): void } }).ctx.setText(t), text);
const param = (page: Page, name: string) => new URL(page.url()).searchParams.get(name);

test('the left pane renders the dev build, unsaved edits included', async ({ page }) => {
  await open(page, { version: PINNED });
  await expect(pane(page, 'left')).toHaveAttribute('data-status', 'rendered');
  await expect(pane(page, 'left').locator('.title')).toHaveText('v13 dev');
  await expect(svg(page, 'left')).toContainText('Alpha');

  await setText(page, 'flowchart LR\n  A[Delta] --> B[Beta]\n');
  await expect(svg(page, 'left')).toContainText('Delta');
});

test('the left pane renders with the e2e page\'s plugins: icons and hand-drawn (#391)', async ({
  page,
}) => {
  await open(page, { version: PINNED });
  await setText(page, 'flowchart LR\n  A["fa:fa-bell Alert"] --> B[Beta]\n');
  await expect(svg(page, 'left')).toContainText('Alert');
  await expect(svg(page, 'left')).not.toContainText('fa:fa-bell');
  await setText(page, '---\nconfig:\n  look: handDrawn\n---\nstateDiagram-v2\n  [*] --> A\n  A --> B\n');
  const a = svg(page, 'left').locator('g.node[data-id="A"]');
  await expect(a.locator('path').first()).toBeAttached();
  await expect(a.locator('rect')).toHaveCount(0);
});

test('the panes are sandboxed: an opaque origin that cannot reach the file API', async ({
  page,
}) => {
  await open(page, { version: PINNED });
  await expect(pane(page, 'left')).toHaveAttribute('data-status', 'rendered');
  for (const side of ['left', 'right'] as const) {
    await expect(page.locator(`dev-tab-compare iframe[data-side="${side}"]`)).toHaveAttribute(
      'sandbox',
      'allow-scripts'
    );
  }
  const left = page.frames().find((f) => f.url().endsWith('/dev/compare-pane.html'));
  expect(left).toBeDefined();
  expect(await left!.evaluate(() => window.origin)).toBe('null');
  const reach = await left!.evaluate(async () => {
    const outcomes: string[] = [];
    for (const init of [
      { method: 'GET' },
      { method: 'PUT', headers: { 'x-mermaid-dev': '1' }, body: 'flowchart LR\n  X' },
    ]) {
      outcomes.push(
        await fetch('/dev/api/file?path=a/one.mmd', init).then(
          (r) => `read ${r.status}`,
          () => 'blocked'
        )
      );
    }
    return outcomes;
  });
  expect(reach).toEqual(['blocked', 'blocked']);
  expect(readFileSync(explorer.path(FILE), 'utf8')).toBe(SOURCE);
});

test('a render error shows on its own side', async ({ page }) => {
  await open(page, { version: PINNED });
  await expect(svg(page, 'left')).toBeVisible();
  await setText(page, 'this is not a diagram\n');
  await expect(pane(page, 'left')).toHaveAttribute('data-status', 'error');
  await expect(pane(page, 'left').locator('.error')).not.toBeEmpty();
  await expect(frame(page, 'left').locator('#msg.error')).toBeVisible();
});

test('both panes render the same text with the pinned mermaid@12', async ({ page }) => {
  needsNetwork();
  await open(page, { version: PINNED });
  await expect(pane(page, 'right').locator('.title')).toHaveText(`mermaid@${PINNED}`);
  for (const side of ['left', 'right'] as const) {
    await expect(pane(page, side)).toHaveAttribute('data-status', 'rendered');
    await expect(svg(page, side)).toContainText('Alpha');
    await expect(svg(page, side)).toContainText('Beta');
  }
  await setText(page, 'flowchart LR\n  A[Delta] --> B[Beta]\n');
  for (const side of ['left', 'right'] as const) {
    await expect(svg(page, side)).toContainText('Delta');
    // The time is the median of five timed renders, with the spread on hover (#358).
    const time = pane(page, side).locator('[data-testid="render-time"]');
    await expect(time).toHaveAttribute('data-ms', /^\d/);
    await expect(time).toHaveAttribute('data-runs', '5');
    await expect(time).toHaveAttribute('title', /^Median of 5 render\(\) calls.*\(min .+, max .+\)$/);
  }
  await expect(pane(page, 'left').locator('[data-testid="render-speed"]')).toHaveAttribute(
    'data-speed',
    /^(faster|slower|same)$/
  );

  // An error on the npm side shows there too.
  await setText(page, 'this is not a diagram\n');
  await expect(pane(page, 'right')).toHaveAttribute('data-status', 'error');
  await expect(frame(page, 'right').locator('#msg.error')).toBeVisible();
});

test('the default is the newest mermaid@12', async ({ page }) => {
  needsNetwork();
  await open(page);
  await expect(pane(page, 'right').locator('.title')).toHaveText(/^mermaid@12\.\d+\.\d+$/);
  await expect(svg(page, 'right')).toContainText('Alpha');
  expect(param(page, 'version')).toBeNull();
});

test('switching the version re-renders the right pane and goes in the URL', async ({ page }) => {
  needsNetwork();
  await open(page, { version: PINNED });
  await expect(svg(page, 'right')).toContainText('Alpha');

  await page.locator('dev-tab-compare sl-select[data-role="version"]').click();
  await page.locator(`dev-tab-compare sl-option[value="${OTHER}"]`).click();
  await expect(pane(page, 'right').locator('.title')).toHaveText(`mermaid@${OTHER}`);
  await expect(pane(page, 'right')).toHaveAttribute('data-status', 'rendered');
  await expect(svg(page, 'right')).toContainText('Alpha');
  expect(param(page, 'version')).toBe(OTHER);
});

test('D toggles the pixel-diff overlay', async ({ page }) => {
  needsNetwork();
  await open(page, { version: PINNED });
  await expect(pane(page, 'left')).toHaveAttribute('data-status', 'rendered');
  await expect(pane(page, 'right')).toHaveAttribute('data-status', 'rendered');
  await expect(overlay(page)).toHaveCount(0);

  await page.keyboard.press('d');
  const status = page.locator('dev-tab-compare [data-testid="compare-diff-status"]');
  await expect(status).toHaveAttribute('data-changed-pixels', /^\d+$/);
  await expect(overlay(page)).toBeVisible();
  expect(param(page, 'diff')).toBe('1');

  await page.keyboard.press('d');
  await expect(overlay(page)).toHaveCount(0);
  expect(param(page, 'diff')).toBeNull();

  // The button does the same.
  await page.locator('dev-tab-compare sl-button[data-action="diff"]').click();
  await expect(overlay(page)).toBeVisible();
});

test('the URL restores the version and the diff', async ({ page }) => {
  needsNetwork();
  await open(page, { version: OTHER, diff: '1' });
  await expect(pane(page, 'right').locator('.title')).toHaveText(`mermaid@${OTHER}`);
  await expect(page.locator('dev-tab-compare sl-select[data-role="version"]')).toHaveJSProperty(
    'value',
    OTHER
  );
  await expect(overlay(page)).toBeVisible();
});
