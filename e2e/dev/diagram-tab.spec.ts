/**
 * The Diagram tab (#60): the svg and the Messages panel side by side in a resizable split.
 * The panel lists the render's warnings and parse diagnostics (clicking a diagnostic opens the
 * Code tab at its line) and captures `console.*` with level toggles, a filter and clear.
 */
import { expect, test, type Page } from '@playwright/test';
import { startExplorerServer, type ExplorerServer } from './explorer-server.ts';

const FILES = {
  'a/warn.mmd': 'flowchart LR\n  A@{ icon: "fa:user", label: "User" } --> B[Beta]\n',
  // The `[` on line 3 is never closed: UNCLOSED at 3:10.
  'a/error.mmd': 'flowchart LR\n  A --> B\n  B --> C[oops\n',
  'a/ok.mmd': 'flowchart LR\n  A[Alpha] --> B[Beta]\n',
};

let explorer: ExplorerServer;

test.beforeAll(async () => {
  explorer = await startExplorerServer(FILES);
});

test.afterAll(async () => {
  await explorer.close();
});

const tab = (page: Page) => page.locator('dev-tab-diagram');
const diagramSvg = (page: Page) => tab(page).locator('.canvas > svg');
const messages = (page: Page) => tab(page).locator('[data-message]');
const logs = (page: Page) => tab(page).locator('dev-console-panel .logline');

test('a render warning is listed with its code and message', async ({ page }) => {
  await page.goto(explorer.url('a/warn.mmd'));
  await expect(diagramSvg(page)).toContainText('User');
  const warning = messages(page).filter({ hasText: 'without an icons extension' });
  await expect(warning).toHaveCount(1);
  await expect(warning).toHaveAttribute('data-severity', 'warning');
  await expect(warning).toContainText('ICON_NOT_RENDERED');
});

test('a syntax error lists its diagnostic at line:column; clicking opens Code there', async ({
  page,
}) => {
  await page.goto(explorer.url('a/error.mmd'));
  await expect(diagramSvg(page)).toHaveCount(0);
  const diagnostic = messages(page).filter({ hasText: 'UNCLOSED' });
  await expect(diagnostic).toHaveCount(1);
  await expect(diagnostic).toHaveAttribute('data-severity', 'error');
  await expect(diagnostic).toContainText('3:10');
  await expect(diagnostic).toContainText('Unclosed node label');

  await diagnostic.click();
  await expect(page).toHaveURL(/[?&]tab=code\b/);
  await expect
    .poll(() =>
      page
        .locator('dev-tab-code')
        .evaluate((el) => (el as unknown as { position: unknown }).position)
    )
    .toEqual({ line: 3, column: 10 });
});

test('a clean render says there are no messages', async ({ page }) => {
  await page.goto(explorer.url('a/ok.mmd'));
  await expect(diagramSvg(page)).toContainText('Alpha');
  await expect(messages(page)).toHaveCount(0);
  await expect(tab(page).locator('[data-messages-empty]')).toBeVisible();
});

test('the Messages panel has v12 controls: checkboxes, a clearable filter, icon buttons', async ({
  page,
}) => {
  await page.goto(explorer.url('a/ok.mmd'));
  await expect(diagramSvg(page)).toContainText('Alpha');
  const panel = tab(page).locator('dev-console-panel');
  await expect(panel.locator('sl-checkbox[data-toggle]')).toHaveCount(4);
  await expect(panel.locator('sl-input[data-filter][clearable]')).toHaveCount(1);
  await expect(panel.locator('sl-button[data-action="copy"] sl-icon[name="clipboard"]')).toHaveCount(1);
  await expect(panel.locator('sl-button[data-action="clear"] sl-icon[name="trash"]')).toHaveCount(1);
  // Icons draw svgs; the diagram is still the one svg on the canvas.
  await expect(tab(page).locator('.canvas > svg')).toHaveCount(1);
});

test('console output is captured; toggles, the filter and clear narrow it', async ({ page }) => {
  await page.goto(explorer.url('a/ok.mmd'));
  await expect(diagramSvg(page)).toContainText('Alpha');
  await page.evaluate(() => {
    console.warn('dev-capture alpha', { n: 1 });
    console.warn('%cdev-capture beta', 'color: red');
    console.error('dev-capture gamma');
  });
  const captured = logs(page).filter({ hasText: 'dev-capture' });
  await expect(captured).toHaveCount(3);
  await expect(captured.nth(0)).toContainText('dev-capture alpha {"n":1}');
  // `%c` and its css argument are stripped.
  await expect(captured.nth(1).locator('.message')).toHaveText('dev-capture beta');
  await expect(captured.nth(1)).toHaveAttribute('data-level', 'warn');

  const filter = tab(page).locator('dev-console-panel sl-input[data-filter] input');
  await filter.fill('beta');
  await expect(captured).toHaveCount(1);
  await expect(captured).toContainText('dev-capture beta');
  await filter.fill('dev-capture');
  await expect(captured).toHaveCount(3);

  await tab(page).locator('dev-console-panel sl-checkbox[data-toggle="warn"]').click();
  await expect(captured).toHaveCount(1);
  await expect(captured).toContainText('dev-capture gamma');
  await tab(page).locator('dev-console-panel sl-checkbox[data-toggle="warn"]').click();
  await expect(captured).toHaveCount(3);

  await tab(page).locator('dev-console-panel sl-button[data-action="clear"]').click();
  await expect(captured).toHaveCount(0);
});

test('the split position is remembered across reloads', async ({ page }) => {
  await page.goto(explorer.url('a/ok.mmd'));
  const split = tab(page).locator('sl-split-panel');
  await expect(split).toHaveAttribute('position', '75');
  await split.evaluate((el) => {
    (el as unknown as { position: number }).position = 40;
  });
  await page.reload();
  await expect(diagramSvg(page)).toContainText('Alpha');
  await expect(split).toHaveAttribute('position', '40');
});
