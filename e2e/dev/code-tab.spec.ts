/**
 * The Code tab (#59): CodeMirror over the open `.mmd`. Unsaved edits re-render the diagram,
 * Mod-s writes the file and clears the dirty status, an on-disk change while dirty shows a
 * warning, and `ctx.goto('code', { line, column })` opens the editor at that position (the
 * Messages panel's diagnostics, #60).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { startExplorerServer, type ExplorerServer } from './explorer-server.ts';

const FILE = 'a/one.mmd';
const SOURCE = 'flowchart LR\n  A[Alpha] --> B[Beta]\n  B --> C[Gamma]\n';

let explorer: ExplorerServer;

test.beforeEach(async () => {
  explorer = await startExplorerServer({ [FILE]: SOURCE });
});

test.afterEach(async () => {
  await explorer.close();
});

const codeTab = (page: Page) => page.locator('dev-tab-code');
const editor = (page: Page) => page.locator('dev-tab-code .cm-content');
const status = (page: Page) => page.locator('dev-tab-code [data-status]');
const diagram = (page: Page) => page.locator('dev-tab-diagram .canvas > svg');

async function openCode(page: Page): Promise<void> {
  await page.goto(`${explorer.url(FILE)}&tab=code`);
  await expect(editor(page)).toContainText('Alpha');
}

async function replaceText(page: Page, text: string): Promise<void> {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
}

const cursor = (page: Page) =>
  codeTab(page).evaluate((el) => (el as unknown as { position: unknown }).position);

test('editing re-renders the diagram without saving', async ({ page }) => {
  await openCode(page);
  await expect(status(page)).toHaveAttribute('data-status', 'saved');
  // codemirror-lang-mermaid highlights the tokens.
  await expect(page.locator('dev-tab-code .cm-line span').first()).toBeVisible();
  await replaceText(page, 'flowchart LR\n  A[Delta] --> B[Beta]\n');
  await expect(status(page)).toHaveAttribute('data-status', 'dirty');

  await page.locator('sl-tab[panel="diagram"]').click();
  await expect(diagram(page)).toContainText('Delta');
  expect(readFileSync(explorer.path(FILE), 'utf8')).toBe(SOURCE);
});

test('Mod-s writes the file and clears the dirty status', async ({ page }) => {
  await openCode(page);
  const next = 'flowchart LR\n  A[Saved] --> B\n';
  await replaceText(page, next);
  await expect(status(page)).toHaveAttribute('data-status', 'dirty');
  await page.keyboard.press('ControlOrMeta+s');
  await expect.poll(() => readFileSync(explorer.path(FILE), 'utf8')).toBe(next);
  await expect(status(page)).toHaveAttribute('data-status', 'saved');

  // The Save button does the same.
  await replaceText(page, 'flowchart LR\n  A[Button] --> B\n');
  await codeTab(page).locator('sl-button[data-action="save"]').click();
  await expect
    .poll(() => readFileSync(explorer.path(FILE), 'utf8'))
    .toBe('flowchart LR\n  A[Button] --> B\n');
  await expect(status(page)).toHaveAttribute('data-status', 'saved');
});

test('an on-disk change while dirty shows a warning and keeps the edits', async ({ page }) => {
  await openCode(page);
  await page.waitForFunction(() => document.documentElement.dataset.devEvents === 'connected');
  await replaceText(page, 'flowchart LR\n  A[Mine] --> B\n');
  writeFileSync(explorer.path(FILE), 'flowchart LR\n  A[Theirs] --> B\n');

  await expect(status(page)).toHaveAttribute('data-status', 'conflict');
  await expect(codeTab(page).locator('.conflict[role="alert"]')).toBeVisible();
  await expect(editor(page)).toContainText('Mine');

  // Saving overwrites the disk version and clears the warning.
  await page.keyboard.press('ControlOrMeta+s');
  await expect
    .poll(() => readFileSync(explorer.path(FILE), 'utf8'))
    .toBe('flowchart LR\n  A[Mine] --> B\n');
  await expect(status(page)).toHaveAttribute('data-status', 'saved');
  await expect(codeTab(page).locator('.conflict')).toHaveCount(0);
});

test('an on-disk change with no edits updates the editor', async ({ page }) => {
  await openCode(page);
  await page.waitForFunction(() => document.documentElement.dataset.devEvents === 'connected');
  writeFileSync(explorer.path(FILE), 'flowchart LR\n  A[Fresh] --> B\n');
  await expect(editor(page)).toContainText('Fresh');
  await expect(status(page)).toHaveAttribute('data-status', 'saved');
});

test('ctx.goto opens the editor at a line and column', async ({ page }) => {
  await page.goto(explorer.url(FILE));
  await expect(diagram(page)).toBeVisible();

  // What the Messages panel (#60) does with a diagnostic.
  await page.evaluate(() => {
    const tab = document.querySelector('dev-tab-diagram') as unknown as {
      ctx: { goto(tab: string, at?: { line: number; column?: number }): void };
    };
    tab.ctx.goto('code', { line: 3, column: 5 });
  });
  await expect(codeTab(page)).toHaveAttribute('active', '');
  expect(new URL(page.url()).searchParams.get('tab')).toBe('code');
  await expect.poll(() => cursor(page)).toEqual({ line: 3, column: 5 });
  await expect(page.locator('dev-tab-code .cm-activeLineGutter')).toHaveText('3');
  await expect(page.locator('dev-tab-code .cm-editor')).toHaveClass(/cm-focused/);

  // Typing lands at the revealed position.
  await page.keyboard.insertText('X');
  await expect(editor(page)).toContainText('B X--> C[Gamma]');

  // A second goto to a position while Code is already showing moves there too; a column past
  // the end of the line clamps to it, and a missing column means the line start.
  await page.evaluate(() => {
    const tab = document.querySelector('dev-tab-code') as unknown as {
      ctx: { goto(tab: string, at?: { line: number; column?: number }): void };
    };
    tab.ctx.goto('code', { line: 2, column: 999 });
  });
  await expect.poll(() => cursor(page)).toEqual({ line: 2, column: 23 });
  await page.evaluate(() => {
    const tab = document.querySelector('dev-tab-code') as unknown as {
      ctx: { goto(tab: string, at?: { line: number; column?: number }): void };
    };
    tab.ctx.goto('code', { line: 1 });
  });
  await expect.poll(() => cursor(page)).toEqual({ line: 1, column: 1 });
});
