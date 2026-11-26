/**
 * The HTML labels plugin in a real browser (#1278, D694–D697): with
 * `@mermaid-js/plugin-html-labels` registered, labels are measured as HTML and mounted in a
 * `<foreignObject>` through `run()`, through a v12-style `render()` + `bindFunctions(el)` call
 * site and, for a stored svg string, through `mountHtmlLabels(el)`. What `render()` returns
 * holds no HTML, and what is mounted has been through the sanitizer.
 */
import { expect, test, type Page } from '@playwright/test';
import { PAYLOADS, V12_XSS_CASES } from '../../packages/core/src/svg/testing/index.ts';

const FLOW = 'flowchart LR\n  A["Alpha <b>one</b>"] -->|goes| B("`**Beta** two`")';

declare global {
  interface Window {
    pwned?: number;
  }
}

async function open(page: Page): Promise<void> {
  await page.goto('/index.html');
  // The page script sets it once its bundle has loaded.
  await page.waitForFunction(() => 'mermaidHtmlLabels' in window);
}

/** Registers the plugin and draws `source` into `#d` with `run()`. */
async function run(page: Page, source: string, config: Record<string, unknown> = {}) {
  await page.evaluate(
    async ([src, cfg]) => {
      window.mermaid.initialize(cfg);
      await window.mermaid.registerExternalDiagrams([window.mermaidHtmlLabels.htmlLabels]);
      const pre = document.createElement('pre');
      pre.className = 'mermaid';
      pre.id = 'd';
      pre.textContent = src;
      document.body.appendChild(pre);
      await window.mermaid.run();
    },
    [source, config] as const
  );
}

/** Each mounted label: its HTML, the holder's size and the size its content takes. */
const labels = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#d g.mermaid-html-label')].map((g) => {
      const holder = g.querySelector('foreignObject');
      const wrapper = holder?.firstElementChild as HTMLElement | null | undefined;
      const box = wrapper?.getBoundingClientRect();
      return {
        html: wrapper?.innerHTML,
        holders: g.querySelectorAll('foreignObject').length,
        placeholders: g.querySelectorAll(':scope > rect, :scope > desc').length,
        width: Number(holder?.getAttribute('width')),
        height: Number(holder?.getAttribute('height')),
        contentWidth: box?.width,
        contentHeight: box?.height,
        color: wrapper && getComputedStyle(wrapper).color,
        fill: getComputedStyle(g).fill,
      };
    })
  );

test('run() mounts each label as HTML of the size it was measured at', async ({ page }) => {
  await open(page);
  await run(page, FLOW);
  const mounted = await labels(page);
  expect(mounted.map((l) => l.html)).toEqual([
    'goes',
    'Alpha <b>one</b>',
    '<strong>Beta</strong> two',
  ]);
  for (const label of mounted) {
    expect(label.holders).toBe(1);
    expect(label.placeholders).toBe(0);
    expect(label.width).toBeGreaterThan(0);
    // The content fits the box core laid the diagram out with.
    expect(label.contentWidth!).toBeLessThanOrEqual(label.width);
    expect(label.contentHeight!).toBeLessThanOrEqual(label.height);
    // The text takes the colour the SVG label would have had.
    expect(label.color).toBe(label.fill);
  }
  await expect(page.locator('#d text')).toHaveCount(0);
});

test('a node is laid out around its HTML label', async ({ page }) => {
  await open(page);
  await run(
    page,
    'flowchart LR\n  A["<table><tr><td>one</td><td>two</td></tr><tr><td>three</td><td>four</td></tr></table>"]'
  );
  const inside = await page.evaluate(() => {
    const node = document.querySelector('#d g.node rect')!.getBoundingClientRect();
    const table = document.querySelector('#d table')!.getBoundingClientRect();
    return (
      table.left >= node.left &&
      table.right <= node.right &&
      table.top >= node.top &&
      table.bottom <= node.bottom
    );
  });
  expect(inside).toBe(true);
});

test('render() returns an inert string, and bindFunctions(el) mounts it once', async ({ page }) => {
  await open(page);
  const svg = await page.evaluate(async (src) => {
    await window.mermaid.registerExternalDiagrams([window.mermaidHtmlLabels.htmlLabels]);
    const result = await window.mermaid.render('d1', src);
    const el = document.createElement('div');
    el.id = 'd';
    el.innerHTML = result.svg;
    document.body.appendChild(el);
    result.bindFunctions?.(el);
    result.bindFunctions?.(el);
    return result.svg;
  }, FLOW);
  expect(svg).not.toContain('foreignObject');
  expect(svg).not.toMatch(/<(div|b|strong)[ >]/);
  expect(svg).toContain('<desc>&lt;div');
  const mounted = await labels(page);
  expect(mounted).toHaveLength(3);
  expect(mounted.every((l) => l.holders === 1)).toBe(true);
});

test('mountHtmlLabels(el) mounts a stored svg string', async ({ page }) => {
  await open(page);
  const count = await page.evaluate(async (src) => {
    await window.mermaid.registerExternalDiagrams([window.mermaidHtmlLabels.htmlLabels]);
    const { svg } = await window.mermaid.render('d1', src);
    const el = document.createElement('div');
    el.id = 'd';
    el.innerHTML = JSON.parse(JSON.stringify(svg)) as string;
    document.body.appendChild(el);
    return window.mermaidHtmlLabels.mountHtmlLabels(el);
  }, FLOW);
  expect(count).toBe(3);
  expect((await labels(page)).map((l) => l.html)).toContain('Alpha <b>one</b>');
});

test('what is mounted has been sanitized', async ({ page }) => {
  await open(page);
  const source = [
    'flowchart TB',
    '  A["<img src=x onerror=window.pwned=1> image"]',
    "  B[\"<a href='javascript:window.pwned=2'>bad</a> <a href='https://mermaid.js.org' target='_blank'>good</a>\"]",
    '  C["<span style=\'position:fixed;top:0;background:url(https://example.com/x.png);color:red\'>styled</span>"]',
    '  D["<script>window.pwned=3</script>script"]',
    '  E["<iframe src=https://example.com></iframe> List<T>"]',
  ].join('\n');
  await run(page, source);
  const seen = await page.evaluate(() => {
    const root = document.querySelector('#d')!;
    const span = root.querySelector<HTMLElement>('span[style]');
    return {
      pwned: window.pwned,
      handlers: root.querySelectorAll('[onerror]').length,
      hrefs: [...root.querySelectorAll('a')].map((a) => a.getAttribute('href')),
      rels: [...root.querySelectorAll('a')].map((a) => a.getAttribute('rel')),
      style: span?.getAttribute('style'),
      color: span?.style.color,
      position: span?.style.position,
      image: span?.style.backgroundImage,
      scripts: root.querySelectorAll('script').length,
      frames: root.querySelectorAll('iframe').length,
      text: root.textContent,
    };
  });
  expect(seen.pwned).toBeUndefined();
  expect(seen.handlers).toBe(0);
  expect(seen.hrefs).toEqual([null, 'https://mermaid.js.org']);
  expect(seen.rels).toEqual([null, 'noopener noreferrer']);
  // The declarations that position the element or load something are gone; the colour stays.
  expect(seen.color).toBe('red');
  expect(seen.position).toBe('');
  expect(seen.image).toBe('');
  expect(seen.style).not.toMatch(/url\(|fixed|top/);
  expect(seen.scripts).toBe(0);
  expect(seen.frames).toBe(0);
  // Text shaped like a tag that the plugin does not allow is shown, not lost.
  expect(seen.text).toContain('List<T>');
  expect(seen.text).not.toContain('window.pwned=3');
});

test('hostile labels run nothing once mounted', async ({ page }) => {
  await open(page);
  // Core's payloads and every hostile text of v12's XSS cases, each as a node and an edge label.
  const sources = [...PAYLOADS, ...V12_XSS_CASES.flatMap((c) => c.text ?? [])].map((text) => {
    const label = text.replace(/"/g, '#quot;');
    return `flowchart LR\n  A["${label}"] -->|"${label}"| B`;
  });
  const seen = await page.evaluate(async (all) => {
    const trap = (): void => void (window.pwned = 1);
    Object.assign(window, { alert: trap, xssAttack: trap, msgbox: trap });
    await window.mermaid.registerExternalDiagrams([window.mermaidHtmlLabels.htmlLabels]);
    const root = document.createElement('div');
    root.id = 'd';
    document.body.appendChild(root);
    let mounted = 0;
    for (const [i, source] of all.entries()) {
      // A diagram v13 rejects draws nothing: there is nothing to mount.
      const result = await window.mermaid.render(`d${i}`, source).catch(() => undefined);
      if (!result) continue;
      const el = document.createElement('div');
      el.innerHTML = result.svg;
      root.appendChild(el);
      result.bindFunctions?.(el);
      mounted += el.querySelectorAll('foreignObject').length;
    }
    // A failed image load reports late: give `onerror` handlers the time to run.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const handlers = [...root.querySelectorAll('*')].filter((el) =>
      el.getAttributeNames().some((name) => name.startsWith('on'))
    );
    return {
      mounted,
      pwned: window.pwned,
      handlers: handlers.length,
      active: root.querySelectorAll('script, iframe, object, embed, style, link, form').length,
      links: [...root.querySelectorAll('[href], [src]')]
        .map((el) => (el.getAttribute('href') ?? el.getAttribute('src'))!)
        .filter((url) => /^\s*(javascript|vbscript|data|file|smb|obsidian):/i.test(url)),
    };
  }, sources);
  expect(seen.mounted).toBeGreaterThan(sources.length);
  expect(seen.pwned).toBeUndefined();
  expect(seen.handlers).toBe(0);
  expect(seen.active).toBe(0);
  expect(seen.links).toEqual([]);
});

test('linkSchemes decide which links a label keeps', async ({ page }) => {
  await open(page);
  const source =
    "flowchart LR\n  A[\"<a href='tel:123'>call</a> <a href='https://x.test'>web</a>\"]";
  await run(page, source, { linkSchemes: ['tel'] });
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('#d a')].map((a) => a.getAttribute('href'))
  );
  expect(hrefs).toEqual(['tel:123', null]);
});

test('htmlLabels: false draws SVG labels, as without the plugin', async ({ page }) => {
  await open(page);
  await run(page, FLOW, { htmlLabels: false });
  await expect(page.locator('#d foreignObject')).toHaveCount(0);
  await expect(page.locator('#d g.node text')).toHaveCount(2);
});

test('a deterministic render draws SVG labels', async ({ page }) => {
  await open(page);
  await run(page, FLOW, { deterministic: true });
  await expect(page.locator('#d foreignObject')).toHaveCount(0);
});

test('a word wider than the wrap width stays whole and the label grows', async ({ page }) => {
  await open(page);
  await run(
    page,
    'flowchart LR\n  A["Pneumonoultramicroscopicsilicovolcanoconiosisandmoreandmore"]'
  );
  const [label] = await labels(page);
  expect(label!.width).toBeGreaterThan(200);
  expect(label!.contentWidth!).toBeLessThanOrEqual(label!.width);
});
