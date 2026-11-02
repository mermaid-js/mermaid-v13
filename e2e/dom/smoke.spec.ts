/**
 * Browser smoke render (CI `smoke-render` chromium/firefox/webkit): one fixture through the
 * public `mermaid` API, parsed back by the browser as an SVG document, then mounted.
 */
import { expect, test } from '@playwright/test';

test('smoke render', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window.mermaid?.render === 'function');
  const out = await page.evaluate(async () => {
    const result = await window.mermaid.render(
      'smoke',
      'flowchart LR\n  A[Start] --> B{Choice}\n  B -->|yes| C[(Done)]\n'
    );
    const doc = new DOMParser().parseFromString(result.svg, 'image/svg+xml');
    const el = document.createElement('div');
    document.body.appendChild(el);
    await window.mermaid.mount(el, 'flowchart TB\n  X --> Y').ready;
    return {
      root: doc.documentElement.tagName,
      parseError: doc.getElementsByTagName('parsererror').length,
      scripts: doc.getElementsByTagName('script').length,
      nodes: doc.querySelectorAll('.node').length,
      warnings: result.warnings,
      width: result.width,
      mounted: el.querySelectorAll('svg .node').length,
    };
  });
  expect(out).toEqual({
    root: 'svg',
    parseError: 0,
    scripts: 0,
    nodes: 3,
    warnings: [],
    width: out.width,
    mounted: 2,
  });
  expect(out.width).toBeGreaterThan(0);
});
