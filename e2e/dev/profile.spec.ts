/**
 * The Profile tab (#62): it renders the open diagram, or every diagram in its folder, N times
 * through the dev build with `@mermaid-js/core/timing` on, and reports the trimmed mean per
 * stage, a score and (for a folder) one row per file, copyable as JSON.
 */
import { readdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const BIG = 'flowchart/pr-check/12-should-render-a-flowchart-with-long-names-and-class-definitions.mmd';
const FOLDER = 'flowchart/baseline/subgraphs';
const folderFiles = readdirSync(`e2e/diagrams/${FOLDER}`)
  .filter((name) => name.endsWith('.mmd'))
  .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  .map((name) => `${FOLDER}/${name}`);

const tab = (page: Page) => page.locator('dev-tab-profile');

async function openProfile(page: Page, file: string): Promise<void> {
  const path = file.slice(0, file.lastIndexOf('/'));
  await page.goto(`/dev/?path=${path}&file=${file}&tab=profile`);
  await expect(page.locator('dev-tab-diagram svg')).toBeAttached();
}

async function run(page: Page, scope: 'diagram' | 'folder', iterations: number): Promise<void> {
  await tab(page).locator('sl-select[data-profile="scope"]').evaluate((el, value) => {
    (el as HTMLElement & { value: string }).value = value;
    el.dispatchEvent(new Event('sl-change', { bubbles: true, composed: true }));
  }, scope);
  await tab(page).locator('sl-input[data-profile="iterations"]').evaluate((el, value) => {
    (el as HTMLElement & { value: string }).value = value;
    el.dispatchEvent(new Event('sl-change', { bubbles: true, composed: true }));
  }, String(iterations));
  await tab(page).locator('sl-button[data-profile="run"]').click();
  await expect(tab(page).locator('table.stages')).toBeVisible({ timeout: 60_000 });
}

/** `{ stage: ms }` from the stage table's `layered` column (full precision, `data-ms`). */
const stageCells = (page: Page) =>
  tab(page)
    .locator('table.stages tr[data-stage]')
    .evaluateAll((rows) =>
      Object.fromEntries(
        rows.map((row) => [
          row.getAttribute('data-stage'),
          Number(row.querySelector('td[data-layout="layered"]')?.getAttribute('data-ms')),
        ])
      )
    );

test('profiling one diagram fills one row per stage with numbers > 0', async ({ page }) => {
  await openProfile(page, BIG);
  await run(page, 'diagram', 10);
  const stages = await stageCells(page);
  expect(Object.keys(stages).sort()).toEqual(['layout', 'parse', 'serialise']);
  for (const ms of Object.values(stages)) expect(ms).toBeGreaterThan(0);
  const score = Number(
    await tab(page).locator('table.stages tr.score td[data-layout="layered"]').getAttribute('data-ms')
  );
  expect(score).toBeGreaterThan(0);
  await expect(tab(page).locator('table.files')).toHaveCount(0);
});

test('folder mode adds one row per file, and copy-as-JSON has the same numbers', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openProfile(page, folderFiles[0]);
  await run(page, 'folder', 3);

  const rows = tab(page).locator('table.files tr[data-file]');
  expect(await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-file')))).toEqual(
    folderFiles
  );
  const stages = await stageCells(page);
  expect(Object.keys(stages).sort()).toEqual(['layout', 'parse', 'serialise']);
  for (const ms of Object.values(stages)) expect(ms).toBeGreaterThan(0);
  const fileTotals = await rows.evaluateAll((els) =>
    els.map((el) => Number(el.querySelector('td[data-layout="layered"]')?.getAttribute('data-ms')))
  );

  await tab(page).locator('sl-button[data-profile="copy"]').click();
  await expect(tab(page).locator('[data-profile="copied"]')).toBeVisible();
  const json = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as {
    scope: string;
    iterations: number;
    stages: string[];
    layouts: {
      layout: string;
      score: number;
      stageTotals: Record<string, number>;
      perDiagram: { diagram: string; total: number }[];
    }[];
  };
  expect(json.scope).toBe('folder');
  expect(json.iterations).toBe(3);
  const layered = json.layouts.find((l) => l.layout === 'layered');
  expect(layered?.stageTotals).toEqual(stages);
  expect(layered?.perDiagram.map((d) => d.diagram)).toEqual(folderFiles);
  expect(layered?.perDiagram.map((d) => d.total)).toEqual(fileTotals);
  expect(layered?.score).toBeGreaterThan(0);
});
