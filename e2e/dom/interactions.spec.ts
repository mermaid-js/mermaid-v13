/**
 * The interactions plugin in a real browser (#23, R-PLUG-9, D47): with
 * `@mermaid-js/plugin-interactions` registered, `click X callback` / `call` run the function
 * named on `window` when the node is clicked, through `run()` and through a v12-style
 * `render()` + `bindFunctions(el)` call site. Without it nothing is bound.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

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
 * Element menus (#147, D105) on sequence-like markup: the menu test diagram, registered as
 * `sequence`, emits `menu` nodes (`AstMenu`) and draws #143's participant groups (the whole
 * participant, then its top and bottom symbol). The plugin builds menus as DOM after the svg.
 */
async function setUp(page: Page): Promise<void> {
  await open(page);
  // The test diagram is `width="100%"`: keep it small enough to fit the viewport.
  await page.addStyleTag({ content: '#d { width: 300px; }' });
  await page.evaluate(async () => {
    await window.mermaid.registerExternalDiagrams(
      [window.menuDiagram as never, window.mermaidInteractions],
      { replace: true }
    );
  });
}

const symbol = (page: Page, scope: string, id: string, position: 'top' | 'bottom') =>
  page.locator(`${scope} g.actor-${position}[data-id="${id}"]`);

/** The menu's top-left corner against the anchor's bottom-left corner. */
async function expectBelow(menu: Locator, anchor: Locator): Promise<void> {
  const a = (await anchor.boundingBox())!;
  const m = (await menu.boundingBox())!;
  expect(Math.abs(m.x - a.x)).toBeLessThan(1.5);
  expect(Math.abs(m.y - (a.y + a.height))).toBeLessThan(1.5);
}

test('a menu on nested participant groups: either symbol toggles it, under the top one', async ({
  page,
}) => {
  await setUp(page);
  const out = await page.evaluate(async () => {
    const el = document.createElement('div');
    el.id = 'd';
    document.body.appendChild(el);
    const text = window.menuText([
      { target: 'P', links: { Docs: '/docs', Bad: 'javascript:alert(1)' } },
    ]);
    await window.mermaid.run({ nodes: [Object.assign(el, { textContent: text })] });
    return { inSvg: el.querySelectorAll('svg .actorPopupMenu').length, html: el.innerHTML };
  });
  expect(out.inSvg).toBe(0);
  const menu = page.locator('#d > svg + div.actorPopupMenu[data-menu-for="P"]');
  await expect(menu).toBeHidden();
  await symbol(page, '#d', 'P', 'bottom').click();
  await expect(menu).toBeVisible();
  await expectBelow(menu, symbol(page, '#d', 'P', 'top'));
  await expect(menu.locator('a')).toHaveText(['Docs', 'Bad']);
  await expect(menu.locator('a').nth(1)).toHaveAttribute('href', 'about:blank');
  await symbol(page, '#d', 'P', 'top').click();
  await expect(menu).toBeHidden();
  await symbol(page, '#d', 'Q', 'top').click();
  await expect(page.locator('#d div.actorPopupMenu')).toHaveCount(1);
});

test('two diagrams in one element keep their own menus for the same participant', async ({
  page,
}) => {
  await setUp(page);
  await page.evaluate(async () => {
    const el = document.createElement('div');
    el.id = 'd';
    document.body.appendChild(el);
    const one = await window.mermaid.render(
      'one',
      window.menuText([{ target: 'P', links: { One: '/one' } }], ['P', 'Q'])
    );
    const two = await window.mermaid.render(
      'two',
      window.menuText([{ target: 'P', links: { Two: '/two' } }], ['R', 'P'])
    );
    el.innerHTML = one.svg + two.svg;
    one.bindFunctions?.(el);
    two.bindFunctions?.(el);
  });
  const svgs = page.locator('#d > svg');
  await symbol(page, '#d > svg:nth-of-type(1)', 'P', 'top').click();
  await symbol(page, '#d > svg:nth-of-type(2)', 'P', 'top').click();
  const menus = page.locator('#d > div.actorPopupMenu');
  await expect(menus).toHaveCount(2);
  await expect(menus.nth(0).locator('a')).toHaveText(['One']);
  await expect(menus.nth(1).locator('a')).toHaveText(['Two']);
  await expect(menus.nth(0)).toBeVisible();
  await expect(menus.nth(1)).toBeVisible();
  await expectBelow(menus.nth(1), svgs.nth(1).locator('g.actor-top[data-id="P"]'));
});

test('mount().update with only the menus changed rebinds them', async ({ page }) => {
  await setUp(page);
  await page.evaluate(async () => {
    const el = document.createElement('div');
    el.id = 'd';
    document.body.appendChild(el);
    const m = window.mermaid.mount(el, window.menuText([{ target: 'P', links: { Old: '/old' } }]));
    await m.ready;
    (window as unknown as { mounted: typeof m }).mounted = m;
  });
  await symbol(page, '#d', 'P', 'top').click();
  await expect(page.locator('#d div.actorPopupMenu a')).toHaveText(['Old']);
  await page.evaluate(async () => {
    const m = (window as unknown as { mounted: { update(t: string): Promise<unknown> } }).mounted;
    await m.update(window.menuText([{ target: 'Q', links: { New: '/new' } }]));
  });
  const menus = page.locator('#d div.actorPopupMenu');
  await expect(menus).toHaveCount(1);
  await expect(menus).toHaveAttribute('data-menu-for', 'Q');
  await symbol(page, '#d', 'P', 'top').click();
  await expect(menus).toBeHidden();
  await symbol(page, '#d', 'Q', 'top').click();
  await expect(menus.locator('a')).toHaveText(['New']);
});

test('sequence.forceMenus shows the menu under the top symbol and keeps it there', async ({
  page,
}) => {
  await setUp(page);
  await page.evaluate(async () => {
    const el = document.createElement('div');
    el.id = 'd';
    el.style.width = '400px';
    document.body.appendChild(el);
    const text =
      '---\nconfig:\n  sequence:\n    forceMenus: true\n---\n' +
      window.menuText([{ target: 'Q', links: { Docs: '/docs' } }]);
    const r = await window.mermaid.render('f', text);
    el.innerHTML = r.svg;
    r.bindFunctions?.(el);
  });
  const menu = page.locator('#d div.actorPopupMenu');
  const top = symbol(page, '#d', 'Q', 'top');
  await expect(menu).toBeVisible();
  await expectBelow(menu, top);
  // Content inserted above moves the diagram: the menu moves with it.
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.style.height = '137px';
    document.body.insertBefore(p, document.getElementById('d'));
  });
  await expectBelow(menu, top);
  // The drawing scales with its element: the menu is placed again.
  await page.evaluate(() => (document.getElementById('d')!.style.width = '200px'));
  await expect
    .poll(async () => {
      const a = (await top.boundingBox())!;
      const m = (await menu.boundingBox())!;
      return Math.round(Math.abs(m.x - a.x) + Math.abs(m.y - (a.y + a.height)));
    })
    .toBeLessThan(2);
  await symbol(page, '#d', 'Q', 'top').click();
  await expect(menu).toBeVisible();
});

test('details reads the menu from a JSON element on the page', async ({ page }) => {
  await setUp(page);
  await page.evaluate(async () => {
    const json = document.createElement('script');
    json.type = 'application/json';
    json.id = 'menu-json';
    json.textContent = JSON.stringify({
      links: { Wiki: '/wiki', Bad: 'javascript:alert(1)' },
      properties: { class: 'fromDetails' },
    });
    document.body.appendChild(json);
    const el = document.createElement('div');
    el.id = 'd';
    document.body.appendChild(el);
    const r = await window.mermaid.render(
      'x',
      window.menuText([{ target: 'P', details: 'menu-json' }])
    );
    el.innerHTML = r.svg;
    r.bindFunctions?.(el);
  });
  await symbol(page, '#d', 'P', 'top').click();
  const panel = page.locator('#d div.actorPopupMenu > div.actorPopupMenuPanel.fromDetails');
  await expect(panel).toBeVisible();
  await expect(panel.locator('a')).toHaveText(['Wiki', 'Bad']);
  await expect(panel.locator('a').nth(0)).toHaveAttribute('href', '/wiki');
  await expect(panel.locator('a').nth(1)).toHaveAttribute('href', 'about:blank');
});

test('the real sequence diagram: menus bind on its participant symbols (#145)', async ({
  page,
}) => {
  await open(page);
  await page.addStyleTag({ content: '#d { width: 600px; }' });
  const codes = await page.evaluate(async () => {
    await window.mermaid.registerExternalDiagrams([window.mermaidInteractions]);
    const text = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  links A: {"Docs": "/docs", "Bad": "javascript:alert(1)"}',
      '  link A: Repo @ /repo',
      '  A->>B: hi',
    ].join('\n');
    const { svg, bindFunctions, warnings } = await window.mermaid.render('seq', text);
    const el = document.createElement('div');
    el.id = 'd';
    el.innerHTML = svg;
    document.body.appendChild(el);
    bindFunctions?.(el);
    return warnings.map((w) => w.code);
  });
  expect(codes).toEqual(['URL_REFUSED']);
  const menu = page.locator('#d > svg + div.actorPopupMenu[data-menu-for="A"]');
  await expect(menu).toBeHidden();
  await symbol(page, '#d', 'A', 'bottom').click();
  await expect(menu).toBeVisible();
  await expectBelow(menu, symbol(page, '#d', 'A', 'top'));
  await expect(menu.locator('a')).toHaveText(['Docs', 'Bad', 'Repo']);
  await expect(menu.locator('a').nth(1)).toHaveAttribute('href', 'about:blank');
  await symbol(page, '#d', 'A', 'top').click();
  await expect(menu).toBeHidden();
  await symbol(page, '#d', 'B', 'top').click();
  await expect(page.locator('#d div.actorPopupMenu')).toHaveCount(1);
});
