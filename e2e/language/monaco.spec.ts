/**
 * The Monaco example editor (#36, D98) in a real browser: the example is built with Vite
 * (which also proves the service's dynamic import of the flowchart facet builds) and served
 * with `vite preview`. Scenario as the CodeMirror example's: type an error and see the
 * diagnostic, complete a node id, hover, fold a subgraph, click the preview to move the
 * cursor; plus cursor → preview highlight and the Monarch front-matter state.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EXAMPLE = join(import.meta.dirname, '../../packages/language-service/examples/monaco');
const VITE = join(EXAMPLE, 'node_modules/.bin/vite');

/** The parts of the page's globals the spec reads (set by the example's main.ts). */
interface EditorWindow {
  editor: {
    getValue(): string;
    getPosition(): { lineNumber: number; column: number };
    setPosition(p: { lineNumber: number; column: number }): void;
    setValue(text: string): void;
    focus(): void;
    trigger(source: string, id: string, args: unknown): void;
    getScrolledVisiblePosition(p: { lineNumber: number; column: number }): {
      top: number;
      left: number;
      height: number;
    };
    getDomNode(): HTMLElement;
  };
  monaco: {
    editor: {
      getModelMarkers(filter: object): { message: string; startLineNumber: number }[];
      tokenize(text: string, languageId: string): { type: string; offset: number }[][];
    };
  };
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });

let preview: ChildProcess | undefined;
let url = '';
// Built outside the tree, so no build output is left in the workspace (knip reads it all).
const outDir = mkdtempSync(join(tmpdir(), 'mermaid-monaco-example-'));

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  execFileSync(VITE, ['build', '--logLevel', 'warn', '--outDir', outDir, '--emptyOutDir'], {
    cwd: EXAMPLE,
    stdio: 'inherit',
  });
  const port = await freePort();
  // An explicit IPv4 host: `localhost` may resolve differently for Vite and for fetch.
  preview = spawn(
    VITE,
    ['preview', '--outDir', outDir, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: EXAMPLE, stdio: ['ignore', 'ignore', 'pipe'] }
  );
  let stderr = '';
  preview.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 600; i++) {
    const ok = await fetch(url).then(
      (r) => r.ok,
      () => false
    );
    if (ok) return;
    if (preview.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`vite preview did not start on ${url}: ${stderr}`);
});

test.afterAll(() => {
  preview?.kill();
  rmSync(outDir, { recursive: true, force: true });
});

async function open(page: Page): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => 'editor' in window);
  await expect(page.locator('#preview svg')).toBeVisible();
}

/** Put the cursor at `line`/`column` (1-based) and focus the editor. */
async function moveTo(page: Page, lineNumber: number, column: number): Promise<void> {
  await page.evaluate(
    (p) => {
      const { editor } = window as unknown as EditorWindow;
      editor.focus();
      editor.setPosition(p);
    },
    { lineNumber, column }
  );
}

/** The page coordinates of `line`/`column` in the editor. */
async function pointAt(page: Page, lineNumber: number, column: number) {
  return page.evaluate(
    (p) => {
      const { editor } = window as unknown as EditorWindow;
      const v = editor.getScrolledVisiblePosition(p);
      const box = editor.getDomNode().getBoundingClientRect();
      return { x: box.left + v.left + 3, y: box.top + v.top + v.height / 2 };
    },
    { lineNumber, column }
  );
}

const value = (page: Page) =>
  page.evaluate(() => (window as unknown as EditorWindow).editor.getValue());
const lineText = async (page: Page, line: number) => (await value(page)).split('\n')[line - 1];

test('typing an error shows its diagnostic', async ({ page }) => {
  await open(page);
  await moveTo(page, 9, 6); // after `  end`
  await page.keyboard.press('End');
  await page.keyboard.type('\n  Oops[unclosed');
  // Monaco may auto-close the bracket; take the `]` away again.
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await lineText(page, 10)).trim()).toBe('Oops[unclosed');
  await expect(page.locator('.squiggly-error').first()).toBeVisible();
  const markers = await page.evaluate(() =>
    (window as unknown as EditorWindow).monaco.editor.getModelMarkers({})
  );
  expect(markers.map((m) => m.message).join('\n')).toMatch(/Unclosed node label/);
  await expect(page.locator('#status')).not.toBeEmpty();
});

test('completes a node id', async ({ page }) => {
  await open(page);
  await moveTo(page, 9, 6);
  await page.keyboard.press('End');
  await page.keyboard.type('\n  Done --> Bu');
  await page.keyboard.press('Control+Space');
  const widget = page.locator('.suggest-widget');
  await expect(widget).toBeVisible();
  await expect(widget.locator('.monaco-list-row').first()).toContainText('Build');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lineText(page, 10)).trim()).toBe('Done --> Build');
});

test('hover shows the node docs', async ({ page }) => {
  await open(page);
  const p = await pointAt(page, 5, 14); // `Ready` in `Start --> Ready{Ready?}`
  const hover = page.locator('.monaco-hover:not(.hidden)');
  // Monaco shows a hover after the pointer rests over a word; move in until it does.
  await expect(async () => {
    await page.mouse.move(p.x - 40, p.y + 60);
    await page.mouse.move(p.x, p.y, { steps: 5 });
    await expect(hover).toContainText('node', { timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await expect(hover).toContainText('Ready');
});

test('folds a subgraph and the front matter with the service ranges', async ({ page }) => {
  await open(page);
  await moveTo(page, 7, 3); // `subgraph Ship`
  await page.evaluate(() =>
    (window as unknown as EditorWindow).editor.trigger('spec', 'editor.fold', {})
  );
  await expect(page.locator('.view-line', { hasText: 'Build --> Done' })).toHaveCount(0);
  // Indentation folding would not fold here: `---` and `title:` have the same indent.
  await moveTo(page, 1, 1);
  await page.evaluate(() =>
    (window as unknown as EditorWindow).editor.trigger('spec', 'editor.fold', {})
  );
  await expect(page.locator('.view-line', { hasText: 'title:' })).toHaveCount(0);
});

test('the cursor highlights the preview, and a click on the preview moves the cursor', async ({
  page,
}) => {
  await open(page);
  await moveTo(page, 5, 14);
  await expect(page.locator('#preview')).toHaveAttribute('data-active-ast', 'n:Ready');
  await expect(page.locator('#preview [data-ast="n:Ready"]')).toHaveClass(/ast-active/);

  await page.locator('#preview [data-ast="n:Done"]').click();
  const position = await page.evaluate(() =>
    (window as unknown as EditorWindow).editor.getPosition()
  );
  expect(position).toEqual({ lineNumber: 8, column: 15 }); // `Done` in `Build --> Done`
  await expect(page.locator('#preview')).toHaveAttribute('data-active-ast', 'n:Done');
});

test('Monarch reads front matter as front matter', async ({ page }) => {
  await open(page);
  const tokens = await page.evaluate(() =>
    (window as unknown as EditorWindow).monaco.editor.tokenize(
      "---\ntitle: it's (open\n---\nflowchart LR\n  A --> B\n",
      'mermaid'
    )
  );
  expect(tokens[0]?.[0]?.type).toBe('annotation.mermaid-flowchart');
  expect(tokens[1]?.[0]?.type).toBe('variable.mermaid-flowchart');
  expect(tokens[3]?.[0]?.type).toBe('keyword.mermaid-flowchart');
  expect(tokens[4]?.map((t) => t.type)).toContain('operator.mermaid-flowchart');
});
