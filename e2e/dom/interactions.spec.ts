/**
 * The interactions plugin in a real browser (#23, R-PLUG-9, D47): with
 * `@mermaid-js/plugin-interactions` registered, `click X callback` / `call` run the function
 * named on `window` when the node is clicked, through `run()` and through a v12-style
 * `render()` + `bindFunctions(el)` call site. Without it nothing is bound.
 */
import { expect, test, type Page } from '@playwright/test';

const SOURCE =
  'flowchart LR\n  A[Start] --> B[Next] --> C[End]\n  click A callback "tip"\n  click B call app.go("x, y", 2)\n';

declare global {
  interface Window {
    calls: unknown[][];
    callback(...args: unknown[]): void;
    app: { go(...args: unknown[]): void };
  }
}

async function open(page: Page): Promise<void> {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window.mermaid?.run === 'function');
  await page.evaluate(() => {
    window.calls = [];
    window.callback = (...args) => window.calls.push(['callback', ...args]);
    window.app = { go: (...args) => window.calls.push(['go', ...args]) };
  });
}

const node = (page: Page, id: string) => page.locator(`#d g.node[data-id="${id}"]`);

test('with the plugin, run() binds callbacks that fire on click', async ({ page }) => {
  await open(page);
  await page.evaluate(async (src) => {
    await window.mermaid.registerExternalDiagrams([window.mermaidInteractions]);
    const pre = document.createElement('pre');
    pre.className = 'mermaid';
    pre.id = 'd';
    pre.textContent = src;
    document.body.appendChild(pre);
    await window.mermaid.run();
  }, SOURCE);
  await node(page, 'A').click();
  await node(page, 'B').click();
  await node(page, 'C').click();
  expect(await page.evaluate(() => window.calls)).toEqual([
    ['callback', 'A'],
    ['go', 'x, y', '2'],
  ]);
});

test('with the plugin, a v12 render() + bindFunctions(el) call site binds once', async ({
  page,
}) => {
  await open(page);
  const warnings = await page.evaluate(async (src) => {
    await window.mermaid.registerExternalDiagrams([window.mermaidInteractions]);
    const { svg, bindFunctions, warnings } = await window.mermaid.render('d1', src);
    const el = document.createElement('div');
    el.id = 'd';
    el.innerHTML = svg;
    document.body.appendChild(el);
    bindFunctions?.(el);
    bindFunctions?.(el);
    return warnings.map((w) => w.code);
  }, SOURCE);
  expect(warnings).not.toContain('CALLBACK_IGNORED');
  await node(page, 'A').click();
  expect(await page.evaluate(() => window.calls)).toEqual([['callback', 'A']]);
});

test('without the plugin, nothing is bound and the warning is returned', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(async (src) => {
    const { svg, bindFunctions, warnings } = await window.mermaid.render('d1', src);
    const el = document.createElement('div');
    el.id = 'd';
    el.innerHTML = svg;
    document.body.appendChild(el);
    return { bind: typeof bindFunctions, warnings: warnings.map((w) => w.code) };
  }, SOURCE);
  expect(out).toEqual({ bind: 'undefined', warnings: ['CALLBACK_IGNORED'] });
  await node(page, 'A').click();
  expect(await page.evaluate(() => window.calls)).toEqual([]);
});
