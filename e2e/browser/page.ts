import type { Page } from '@playwright/test';

/** Opens the empty e2e page and waits for the `window.v13` test API (packages/dev viewer). */
export async function openHarness(page: Page): Promise<void> {
  await page.goto('/e2e.html');
  await page.waitForFunction(() => typeof window.v13?.render === 'function');
}

/**
 * A computed colour as 0–255 channels plus alpha, rounded. Chromium serialises `color-mix()`
 * results as `color(srgb r g b)` and literals as `rgb()`, so compare numbers, not strings.
 */
export function channels(css: string): number[] | string {
  const rgb = /^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)$/.exec(css);
  if (rgb) return [+rgb[1]!, +rgb[2]!, +rgb[3]!, rgb[4] === undefined ? 1 : +rgb[4]];
  const srgb = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(css);
  if (srgb)
    return [
      ...[srgb[1], srgb[2], srgb[3]].map((v) => Math.round(Number(v) * 255)),
      srgb[4] === undefined ? 1 : +srgb[4],
    ];
  return css;
}

/** Computed paint of every drawn element in the first diagram, in document order. */
export async function computedPaints(page: Page, selector = '.diagram svg'): Promise<string[]> {
  return page.evaluate((sel) => {
    const svg = document.querySelector(sel);
    if (!svg) throw new Error(`no ${sel}`);
    return [...svg.querySelectorAll('rect, path, polygon, circle, ellipse, text, line')].map(
      (el) => {
        const cs = getComputedStyle(el);
        return `${el.tagName} fill=${cs.fill} stroke=${cs.stroke}`;
      }
    );
  }, selector);
}

declare global {
  interface Window {
    v13: {
      render(
        code: string,
        options?: Record<string, unknown>
      ): Promise<{ svg: string; warnings: { code: string; message: string }[] }>;
      mount(
        code: string,
        options?: Record<string, unknown>,
        parent?: HTMLElement
      ): Promise<{ div: HTMLDivElement; warnings: { code: string; message: string }[] }>;
    };
  }
}
