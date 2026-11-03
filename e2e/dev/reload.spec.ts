/**
 * Live reload (#57): a plain page with the reload client (`/dev/reload.js`) reloads after a
 * source file in a workspace package changes. The spec only touches the file's mtime.
 */
import { utimesSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const SOURCE = join(import.meta.dirname, '..', '..', 'packages', 'core', 'src', 'index.ts');

test('a page with the reload client reloads after a source change', async ({ page }) => {
  await page.goto('/');
  await page.addScriptTag({ url: '/dev/reload.js', type: 'module' });
  await expect(page.locator('html')).toHaveAttribute('data-dev-reload', 'connected');
  // Survives only as long as this document does.
  await page.evaluate(() => ((window as { beforeReload?: boolean }).beforeReload = true));

  const reloaded = page.waitForEvent('load', { timeout: 20_000 });
  const now = new Date();
  utimesSync(SOURCE, now, now);
  await reloaded;
  expect(await page.evaluate(() => (window as { beforeReload?: boolean }).beforeReload)).toBe(
    undefined
  );
});
