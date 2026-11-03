/** The e2e viewer (`packages/dev/www/e2e.html`) renders a multi-block `?graph=`, as v12 did. */
import { expect, test } from '@playwright/test';
import { mermaidUrl } from '../helpers/util.ts';

test('renders every block of a multi-block ?graph= into #block<i>', async ({ page }) => {
  const blocks = ['flowchart LR\n  A[Alpha] --> B[Beta]', 'flowchart TD\n  C[Gamma] --> D[Delta]'];
  await page.goto(mermaidUrl(blocks, {}, false));
  await page.waitForFunction(() => window.rendered === true);
  expect(await page.evaluate(() => window.renderError)).toBeUndefined();
  await expect(page.locator('#block0 svg')).toContainText('Alpha');
  await expect(page.locator('#block1 svg')).toContainText('Gamma');
  await expect(page.locator('#block1 svg')).not.toContainText('Alpha');
  await expect(page.locator('body > div.diagram')).toHaveCount(2);
});

test('a single-block ?graph= still renders into #block', async ({ page }) => {
  await page.goto(mermaidUrl('flowchart LR\n  A[Solo] --> B', {}, false));
  await page.waitForFunction(() => window.rendered === true);
  await expect(page.locator('#block svg')).toContainText('Solo');
});

declare global {
  interface Window {
    rendered?: boolean;
    renderError?: string;
  }
}
