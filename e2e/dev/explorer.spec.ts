/**
 * The Dev Explorer shell at /dev/ (#58): the folder listing matches the snapshot discovery,
 * opening a file renders it, ←/→ step through its folder, the selectors change the render and
 * survive a reload, and editing the open `.mmd` on disk re-renders it.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { supportedFixtureFolders } from '../helpers/mmd-snapshots.ts';
import { startExplorerServer } from './explorer-server.ts';

const EDGES = 'flowchart/baseline/edges';
const edgeFiles = readdirSync(`e2e/diagrams/${EDGES}`)
  .filter((name) => name.endsWith('.mmd'))
  .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

const diagram = (page: Page) => page.locator('dev-tab-diagram svg');
const open = (page: Page, file: string) =>
  page.goto(`/dev/?path=${EDGES}&file=${EDGES}/${file}`);

test('the root lists the folders the snapshot run collects', async ({ page }) => {
  await page.goto('/dev/');
  const cards = page.locator('dev-file-explorer button.card[data-kind="dir"]');
  await expect(cards.first()).toBeVisible();
  expect(await cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-path')))).toEqual(
    supportedFixtureFolders()
  );
});

test('selecting a file renders it and puts it in the URL', async ({ page }) => {
  await page.goto('/dev/');
  for (const dir of ['flowchart', 'flowchart/baseline', EDGES]) {
    await page.locator(`button.card[data-path="${dir}"]`).click();
  }
  await page.locator(`button.card[data-path="${EDGES}/${edgeFiles[0]}"]`).click();
  await expect(diagram(page)).toBeVisible();
  await expect(page.locator('.current-file')).toHaveText(`${EDGES}/${edgeFiles[0]}`);
  expect(new URL(page.url()).searchParams.get('file')).toBe(`${EDGES}/${edgeFiles[0]}`);

  await page.goBack();
  await expect(page.locator('button.card[data-kind="file"]').first()).toBeVisible();
  expect(new URL(page.url()).searchParams.get('path')).toBe(EDGES);
});

test('←/→ step through the sibling diagrams with an n/N counter', async ({ page }) => {
  await open(page, edgeFiles[0]);
  const counter = page.locator('.counter');
  await expect(counter).toHaveText(`(1/${edgeFiles.length})`);
  await expect(diagram(page)).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await expect(counter).toHaveText(`(2/${edgeFiles.length})`);
  await expect(page.locator('.current-file')).toHaveText(`${EDGES}/${edgeFiles[1]}`);
  await expect(diagram(page)).toBeVisible();

  await page.keyboard.press('ArrowLeft');
  await expect(counter).toHaveText(`(1/${edgeFiles.length})`);
  await page.keyboard.press('ArrowLeft');
  await expect(counter).toHaveText(`(1/${edgeFiles.length})`);

  await page.locator('sl-button[data-nav="next"]').click();
  await expect(counter).toHaveText(`(2/${edgeFiles.length})`);
});

test('the selectors offer only what v13 supports', async ({ page }) => {
  await open(page, edgeFiles[0]);
  const values = (setting: string) =>
    page
      .locator(`sl-select[data-setting="${setting}"] sl-option`)
      .evaluateAll((els) => els.map((el) => el.getAttribute('value')));
  await expect
    .poll(() => values('theme'))
    .toEqual(['unset', 'redux', 'default', 'dark', 'forest', 'neutral', 'base', 'auto']);
  expect(await values('layout')).toEqual(['unset', 'layered']);
});

test('a selector changes the render and survives a reload', async ({ page }) => {
  await open(page, edgeFiles[0]);
  await expect(diagram(page)).toBeVisible();
  const before = await diagram(page).evaluate((svg) => svg.outerHTML);

  await page.locator('sl-select[data-setting="theme"]').click();
  await page.locator('sl-select[data-setting="theme"] sl-option[value="dark"]').click();
  await expect.poll(() => diagram(page).evaluate((svg) => svg.outerHTML)).not.toBe(before);
  const dark = await diagram(page).evaluate((svg) => svg.outerHTML);
  expect(new URL(page.url()).searchParams.get('theme')).toBe('dark');

  // The URL carries it…
  await page.reload();
  await expect(page.locator('sl-select[data-setting="theme"]')).toHaveJSProperty('value', 'dark');
  await expect.poll(() => diagram(page).evaluate((svg) => svg.outerHTML)).toBe(dark);

  // …and so does localStorage, for a URL without it.
  await open(page, edgeFiles[0]);
  await expect(page.locator('sl-select[data-setting="theme"]')).toHaveJSProperty('value', 'dark');
  await expect.poll(() => diagram(page).evaluate((svg) => svg.outerHTML)).toBe(dark);
});

test.describe('on a writable root', () => {
  test('editing the open file on disk re-renders it', async ({ page }) => {
    test.setTimeout(120_000);
    const explorer = await startExplorerServer({
      'live/one.mmd': 'flowchart LR\n  A[Before] --> B\n',
    });
    try {
      await page.goto(explorer.url('live/one.mmd'));
      await expect(page.locator('html')).toHaveAttribute('data-dev-events', 'connected');
      await expect(diagram(page)).toContainText('Before');
      await page.evaluate(() => ((window as { stayed?: boolean }).stayed = true));

      writeFileSync(explorer.path('live/one.mmd'), 'flowchart LR\n  A[After] --> B\n');
      await expect(diagram(page)).toContainText('After', { timeout: 20_000 });
      // Re-rendered in place, not reloaded.
      expect(await page.evaluate(() => (window as { stayed?: boolean }).stayed)).toBe(true);
    } finally {
      await explorer.close();
    }
  });
});
