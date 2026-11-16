import { describe, expect, it } from 'vitest';
import {
  inertProblem,
  streamWriter,
  styleText,
  themeStyleSheet,
  treeWriter,
  type SvgWriter,
} from '../svg/index.ts';
import { createTheme, loadTheme, resolveThemeName } from './index.ts';

const choice = resolveThemeName('auto');
const light = await loadTheme(choice.name);
const dark = await loadTheme(choice.dark ?? 'dark');

function render(w: SvgWriter & { finish(): string }, themeVariables = {}): string {
  const t = createTheme(light, { dark, themeVariables });
  const fill = t.color('mainBkg');
  const width = t.length('strokeWidth');
  const auto = t.autoDeclarations();
  if (!auto) throw new Error('expected auto declarations');
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    'data-p': 'm1',
    style: styleText(t.rootStyle()),
  });
  w.styleSheet(themeStyleSheet('m1', auto.light, auto.dark));
  w.leaf('rect', { width: 10, height: 10, fill, 'stroke-width': width });
  w.close();
  return w.finish();
}

describe("theme: 'auto' (R-THEME-8)", () => {
  it('writes a variables-only <style> with prefers-color-scheme; tokens stay on the root', () => {
    const svg = render(streamWriter());
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" data-p="m1" style="--_sw:var(--mermaid-strokeWidth,2px)">' +
        '<style>svg[data-p=m1]{--_mb:var(--mermaid-mainBkg,#ffffff)}' +
        '@media (prefers-color-scheme:dark){svg[data-p=m1]{--_mb:var(--mermaid-mainBkg,#1f2020)}}</style>' +
        '<rect width="10" height="10" fill="var(--_mb)" stroke-width="var(--_sw)"/></svg>'
    );
  });

  it('is byte-identical through the tree backing', () => {
    expect(render(treeWriter())).toBe(render(streamWriter()));
  });

  it('passes the allow-list only when the integrator opts in to the theme style', () => {
    const svg = render(streamWriter());
    expect(inertProblem(svg, { themeStyle: true })).toBeUndefined();
    expect(inertProblem(svg)).toBe('element <style>');
  });

  it('keeps author colours in both schemes', () => {
    const svg = render(streamWriter(), { mainBkg: '#ff0000' });
    expect(svg.match(/--_mb:var\(--mermaid-mainBkg,#ff0000\)/g)).toHaveLength(2);
  });

  it('rejects any other <style> content even with the opt-in', () => {
    const wrap = (css: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" data-p="m1"><style>${css}</style></svg>`;
    for (const css of [
      'svg{fill:red}',
      'svg[data-p=m1]{fill:red}',
      'svg[data-p=m1]{--_a:url(x)}',
      '@import url(x);',
      'svg[data-p=m1]{--_a:red}svg[data-p=m1]{--_b:blue}',
      '@media print{svg[data-p=m1]{--_a:red}}',
      'svg[data-p=m1]{--_a:red;}}',
      '*{--_a:red}',
      'svg[data-p=m1]{--_a:expression(alert(1))}',
    ])
      expect(inertProblem(wrap(css), { themeStyle: true }), css).toMatch(/style/);
    // Only directly under the root, and only once.
    const nested =
      '<svg xmlns="http://www.w3.org/2000/svg"><g><style>svg[data-p=m1]{--_a:red}</style></g></svg>';
    expect(inertProblem(nested, { themeStyle: true })).toMatch(/style/);
  });

  it('only builds sheets from custom properties and safe values', () => {
    expect(() => themeStyleSheet('m 1', {}, {})).toThrow(TypeError);
    expect(() => themeStyleSheet('m1', { '--_a': 'red}svg{fill:red' } as never, {})).toThrow(
      TypeError
    );
    expect(() => themeStyleSheet('m1', { color: 'red' } as never, {})).toThrow(TypeError);
  });
});
