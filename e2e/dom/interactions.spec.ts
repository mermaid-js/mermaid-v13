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

/**
 * Element menus (#147, D105): a fixture extension registered before the plugin puts `menu`
 * nodes (`AstMenu`) on the flowchart AST, as a diagram's parser emits them (sequence actor
 * `link`/`links`). The plugin builds the menu as DOM next to the svg, never inside it.
 */
async function renderMenus(page: Page) {
  return page.evaluate(async (src) => {
    const fixture = {
      id: 'menu-fixture',
      postParse(ast: { children?: unknown[] }) {
        const menu = (target: string, links: Record<string, string>) => ({
          id: `st:${target}`,
          type: 'Link',
          range: { start: 0, end: 0 },
          menu: { target, links },
        });
        return {
          ...ast,
          children: [
            ...(ast.children ?? []),
            menu('A', { Docs: '/docs', Bad: 'javascript:alert(1)' }),
            menu('C', { Bad: 'javascript:alert(2)' }),
          ],
        };
      },
    };
    await window.mermaid.registerExternalDiagrams([fixture as never, window.mermaidInteractions]);
    const { svg, bindFunctions, warnings } = await window.mermaid.render('d1', src);
    const el = document.createElement('div');
    el.id = 'd';
    el.innerHTML = svg;
    document.body.appendChild(el);
    bindFunctions?.(el);
    bindFunctions?.(el);
    return { svg, warnings: warnings.map((w) => w.code) };
  }, 'flowchart LR\n  A[Start] --> B[Next] --> C[End]\n');
}

test('with the plugin, an element menu is DOM beside the svg that a click toggles', async ({
  page,
}) => {
  await open(page);
  const { svg, warnings } = await renderMenus(page);
  expect(svg).not.toContain('actorPopupMenu');
  expect(warnings.filter((w) => w === 'URL_REFUSED')).toHaveLength(2);
  const menus = page.locator('#d > div.actorPopupMenu');
  // Bound once although bindFunctions ran twice; C had no safe link, so it has no menu.
  await expect(menus).toHaveCount(1);
  const menu = page.locator('#d > div.actorPopupMenu[data-menu-for="A"]');
  await expect(menu).toBeHidden();
  await node(page, 'A').click();
  await expect(menu).toBeVisible();
  const link = menu.locator('a');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveText('Docs');
  await expect(link).toHaveAttribute('href', '/docs');
  await expect(link).toHaveAttribute('target', '_blank');
  // The menu opens just below the node.
  const box = (await node(page, 'A').boundingBox())!;
  const at = (await menu.boundingBox())!;
  expect(Math.abs(at.x - box.x)).toBeLessThan(2);
  expect(Math.abs(at.y - (box.y + box.height))).toBeLessThan(2);
  await node(page, 'A').click();
  await expect(menu).toBeHidden();
  // Nodes without a menu stay inert.
  await node(page, 'B').click();
  await expect(menus).toHaveCount(1);
  expect(await page.locator('#d svg a').count()).toBe(0);
});
