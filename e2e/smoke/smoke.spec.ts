/**
 * CI `smoke-render` for the browser runtimes (chromium, firefox, webkit) and a Web Worker: the
 * single-file bundle of the built `mermaid` package (packages/dev `smoke:build`) renders
 * one fixture through `render()`. Run per browser with `--project`.
 */
import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    mermaidSmoke?: string;
  }
}

test('the bundled mermaid package renders on the main thread', async ({ page }) => {
  await page.goto('/smoke.html');
  const summary = await page.evaluate(async () => {
    await import(new URL('/smoke.mjs', location.href).href);
    return window.mermaidSmoke;
  });
  expect(summary).toMatch(/^smoke render ok: flowchart-v2 \d+(\.\d+)?x\d+(\.\d+)?$/);
});

test('the bundled mermaid package renders in a Web Worker', async ({ page }) => {
  await page.goto('/smoke.html');
  const summary = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const src = new URL('/smoke.mjs', location.href).href;
        const code =
          `import(${JSON.stringify(src)}).then(() => postMessage(globalThis.mermaidSmoke),` +
          ` (e) => postMessage('ERR ' + (e && e.message)));`;
        const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        const worker = new Worker(url, { type: 'module' });
        worker.onmessage = (event: MessageEvent<string>) => resolve(event.data);
        worker.onerror = (event) => resolve(`ERR ${event.message}`);
      })
  );
  expect(summary).toMatch(/^smoke render ok: flowchart-v2 /);
});
