/**
 * The canvas measurer in a real browser with a web font that loads late (#9 gap, R-TEXT-7):
 * while the font is missing nothing is cached, and once it loads the next render measures with
 * it, matching a page where the font was there from the start.
 */
import { expect, test, type Page } from '@playwright/test';
import { openHarness } from './page.ts';

const FONT_URL = '/fonts/noto-sans-sc-latin-400-normal.woff2';
// A circle grows with its label (rectangles are widened to minNodeWidth, so they would hide it).
const CODE = 'flowchart LR\n  A((Wim Wom))';
const OPTIONS = {
  measurer: 'canvas',
  config: { themeVariables: { fontFamily: 'LateFont, monospace' } },
};

/** Radius of the circle node, which follows the measured label width. */
async function nodeWidth(page: Page): Promise<number> {
  return page.evaluate(
    async ([code, options]) => {
      const { svg } = await window.v13.render(code as string, options as Record<string, unknown>);
      const m = /<circle [^>]*r="([\d.]+)"/.exec(svg);
      if (!m) throw new Error('no node circle');
      return Number(m[1]);
    },
    [CODE, OPTIONS] as const
  );
}

async function loadFont(page: Page): Promise<void> {
  await page.evaluate(async (url) => {
    const face = new FontFace('LateFont', `url(${url})`);
    document.fonts.add(face);
    await face.load();
  }, FONT_URL);
}

test('a render after a late web font loads measures with that font', async ({ page, browser }) => {
  await openHarness(page);
  const before = await nodeWidth(page);
  await loadFont(page);
  const after = await nodeWidth(page);

  const fresh = await browser.newPage();
  await openHarness(fresh);
  await loadFont(fresh);
  const expected = await nodeWidth(fresh);
  await fresh.close();

  expect(after).toBe(expected);
  expect(after).not.toBe(before);
});

test('the canvas measurer differs from the table where the browser font does', async ({ page }) => {
  await openHarness(page);
  await loadFont(page);
  const canvas = await nodeWidth(page);
  const table = await page.evaluate(
    async ([code, options]) => {
      const { svg } = await window.v13.render(code as string, {
        ...(options as Record<string, unknown>),
        measurer: 'table',
      });
      return Number(/<circle [^>]*r="([\d.]+)"/.exec(svg)![1]);
    },
    [CODE, OPTIONS] as const
  );
  expect(canvas).toBeGreaterThan(0);
  expect(canvas).not.toBe(table);
});
