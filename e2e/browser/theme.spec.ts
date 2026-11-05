/**
 * Theming in a real browser (#13 gaps): host CSS variables re-theme a rendered diagram without
 * a re-render (R-THEME-3), `theme: 'auto'` follows prefers-color-scheme, and the literal
 * colours written with `cssVariables: false` equal what the browser computes from the CSS
 * variable rules (color-mix and friends).
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fixturePath } from '../helpers/mmd-snapshots.ts';
import { assertInert, streamWriter } from '../../packages/core/src/svg/index.ts';
import { createTheme, loadTheme } from '../../packages/core/src/theme/index.ts';
import { channels, computedPaints, openHarness } from './page.ts';

const SIMPLE = 'flowchart LR\n  A[Start] --> B{Choice}\n  B -- yes --> C[(Store)]';
const firstRectFill = `getComputedStyle(document.querySelector('.diagram svg .node rect, .diagram svg .node path')).fill`;

test('setting --mermaid-primaryColor on the host re-themes without re-rendering', async ({
  page,
}) => {
  await openHarness(page);
  await page.evaluate((code) => window.v13.mount(code, { config: { theme: 'default' } }), SIMPLE);
  const markup = await page.locator('.diagram').innerHTML();
  const before = await page.evaluate(firstRectFill);
  expect(before).toBe('rgb(236, 236, 255)'); // default theme primaryColor #ececff

  await page.evaluate(() =>
    document
      .querySelector<HTMLElement>('.diagram')!
      .style.setProperty('--mermaid-primaryColor', '#ff0000')
  );
  expect(await page.evaluate(firstRectFill)).toBe('rgb(255, 0, 0)');
  expect(await page.locator('.diagram').innerHTML()).toBe(markup);
});

test('contrast text follows a host override of the base colour it sits on (R-THEME-4)', async ({
  page,
}) => {
  await openHarness(page);
  await page.evaluate((code) => window.v13.mount(code, { config: { theme: 'default' } }), SIMPLE);
  const label = `getComputedStyle(document.querySelector('.diagram svg .node text')).fill`;
  expect(channels(await page.evaluate(label))).toEqual([51, 51, 51, 1]); // textColor #333 on #ececff
  await page.evaluate(() =>
    document
      .querySelector<HTMLElement>('.diagram')!
      .style.setProperty('--mermaid-primaryColor', '#000000')
  );
  // #333 on black fails AA, so the ink flips to the background colour (white).
  expect(channels(await page.evaluate(label))).toEqual([255, 255, 255, 1]);
});

test('contrast(), invert(), lightenHsl() and darkenHsl() CSS equals the JS-computed literal on many backgrounds', async ({
  page,
}) => {
  await openHarness(page);
  const base = await loadTheme('base');
  const cases: [string, string][] = [];
  for (const bg of ['#000000', '#ffffff', '#777777', '#3366cc', '#fff5ad', '#552222', '#c0ffee']) {
    const rules = {
      inv: 'invert(primaryColor)',
      ink: 'contrast(primaryColor, #333333, #ffffff)',
      ink2: 'contrast(primaryColor, #ffffff, #333333)',
      up: 'lightenHsl(primaryColor, 20%)',
      down: 'darkenHsl(primaryColor, 15%)',
    };
    for (const name of ['inv', 'ink', 'ink2', 'up', 'down']) {
      const vars = createTheme(base, { rules });
      vars.color(name);
      const style = Object.entries({ ...vars.rootStyle(), '--mermaid-primaryColor': bg })
        .map(([k, v]) => `${k}:${v}`)
        .join(';');
      const lit = createTheme(base, {
        rules,
        cssVariables: false,
        themeVariables: { primaryColor: bg },
      }).color(name);
      cases.push([`${style};color:var(--_${name})`, lit]);
    }
  }
  const got = await page.evaluate(
    (all) =>
      all.map(([style, lit]) => {
        const a = document.createElement('div');
        const b = document.createElement('div');
        a.setAttribute('style', style);
        b.style.color = lit;
        document.body.append(a, b);
        return [getComputedStyle(a).color, getComputedStyle(b).color];
      }),
    cases
  );
  const off = got.filter(([css, lit]) => {
    const [x, y] = [channels(css), channels(lit)];
    return (
      typeof x === 'string' || typeof y === 'string' || x.some((v, i) => Math.abs(v - y[i]) > 1)
    );
  });
  expect(off).toEqual([]);
});

test("theme 'auto' follows prefers-color-scheme without re-rendering", async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openHarness(page);
  await page.evaluate((code) => window.v13.mount(code, { config: { theme: 'auto' } }), SIMPLE);
  const light = await computedPaints(page);
  expect(await page.evaluate(firstRectFill)).toBe('rgb(255, 255, 255)'); // redux-color mainBkg

  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await computedPaints(page);
  expect(await page.evaluate(firstRectFill)).toBe('rgb(31, 32, 32)'); // dark primaryColor #1f2020
  expect(dark).not.toEqual(light);
});

function samePaint(a: string, b: string): boolean {
  const parse = (s: string) => /^(\w+) fill=(.*) stroke=(.*)$/.exec(s)!;
  const [, tagA, fillA, strokeA] = parse(a);
  const [, tagB, fillB, strokeB] = parse(b);
  const close = (x: string, y: string) => {
    const [cx, cy] = [channels(x), channels(y)];
    if (typeof cx === 'string' || typeof cy === 'string') return x === y;
    return cx.every((v, i) => Math.abs(v - cy[i]) <= (i === 3 ? 0.01 : 1));
  };
  return tagA === tagB && close(fillA, fillB) && close(strokeA, strokeB);
}

const THEMED = readFileSync(fixturePath('flowchart/baseline/themes/redux.mmd'), 'utf8').replace(
  /^---[\s\S]*?---\n/,
  ''
);

for (const theme of [
  'redux-color',
  'redux',
  'redux-dark',
  'redux-dark-color',
  'default',
  'dark',
  'forest',
  'neutral',
  'base',
  'neo',
]) {
  for (const themeVariables of [undefined, { primaryColor: '#3366cc', lineColor: '#aa5500' }]) {
    const label = themeVariables ? ' with overrides' : '';
    test(`${theme}${label}: literal colours equal the browser's computed CSS-variable colours`, async ({
      page,
    }) => {
      await openHarness(page);
      const config = { theme, themeVariables };
      await page.evaluate(
        async ([code, cfg]) => {
          await window.v13.mount(code, { config: cfg, idPrefix: 'vars' });
          const lit = document.createElement('div');
          lit.id = 'literal';
          document.body.appendChild(lit);
          await window.v13.mount(code, { config: cfg, idPrefix: 'lit', cssVariables: false }, lit);
        },
        [THEMED, config] as const
      );
      const vars = await computedPaints(page, 'body > .diagram svg');
      const literal = await computedPaints(page, '#literal svg');
      expect(literal.length).toBeGreaterThan(10);
      expect(literal.length).toBe(vars.length);
      // Same paint per element, each channel within 1/255 (sRGB rounding).
      const off = literal.filter((lit, i) => !samePaint(lit, vars[i]));
      expect(off.map((lit) => `${lit}  vs  ${vars[literal.indexOf(lit)]}`)).toEqual([]);
    });
  }
}

test('the gradient’s stops follow --mermaid-gradientStart and --mermaid-gradientStop (D182)', async ({
  page,
}) => {
  const theme = createTheme(await loadTheme('redux-color'), {
    themeVariables: { useGradient: true },
    idPrefix: () => 'g1',
  });
  const w = streamWriter({ gradient: theme.gradient() });
  w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: [0, 0, 100, 20] });
  w.leaf('rect', { x: 0, y: 0, width: 100, height: 20, fill: theme.outline('nodeBorder') });
  w.close();
  const svg = w.finish();
  assertInert(svg);
  await page.setContent(`<div class="diagram">${svg}</div>`);
  const stops = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.diagram stop')].map((s) => getComputedStyle(s).stopColor)
    );
  expect(await stops()).toEqual(['rgb(0, 66, 235)', 'rgb(235, 0, 66)']); // #0042eb, #eb0042
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('.diagram')!;
    host.style.setProperty('--mermaid-gradientStart', '#00ff00');
    host.style.setProperty('--mermaid-gradientStop', 'rgb(1 2 3)');
  });
  expect(await stops()).toEqual(['rgb(0, 255, 0)', 'rgb(1, 2, 3)']);
});
