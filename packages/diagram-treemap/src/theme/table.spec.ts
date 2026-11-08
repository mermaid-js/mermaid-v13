/**
 * Treemap's own theme table (spec #428 T4, D406, D407): `cScalePeer<n>` derived from the
 * `cScale` slot by the `dark` trait, the title's colour and size under the `treemap` section.
 * Expected colours are v12 12.2.0's `getThemeVariables()` (probed once, written out by hand).
 * T5's oracle spec compares all eleven themes.
 */
import { createTheme, loadTheme, type Rgba, type ThemeName } from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { theme as table } from './table.ts';

const resolve = async (name: ThemeName, themeVariables?: Record<string, unknown>) =>
  createTheme(await loadTheme(name), {
    diagram: table,
    cssVariables: false,
    ...(themeVariables ? { themeVariables } : {}),
  });

/** Channels within 1.5 of `want` (v12 kept HSL fractions, v13 rounds to bytes). */
function near(got: Rgba | undefined, want: readonly number[]): void {
  expect(got).toBeDefined();
  for (let i = 0; i < 3; i++) expect(Math.abs(got![i]! - want[i]!)).toBeLessThanOrEqual(1.5);
}

describe('treemap theme table', () => {
  it('darkens each cScale slot by 10 HSL points in a light theme (v12 base, neutral)', async () => {
    const base = await resolve('base');
    near(base.rgba('cScalePeer0'), [255, 186, 43]); // hsl(40.59, 100%, 58.33%)
    near(base.rgba('cScalePeer11'), [255, 81, 43]); // hsl(10.59, 100%, 58.33%)
    const neutral = await resolve('neutral');
    near(neutral.rgba('cScalePeer0'), [60, 60, 60]); // hsl(0, 0%, 23.33%)
    near(neutral.rgba('cScalePeer1'), [218, 218, 218]); // hsl(0, 0%, 85.69%)
  });

  it('lightens them under a dark theme or darkMode (v12 dark, base with darkMode)', async () => {
    const dark = await resolve('dark');
    near(dark.rgba('cScalePeer0'), [56, 58, 58]); // hsl(180, 1.59%, 22.35%)
    near(dark.rgba('cScalePeer3'), [84, 110, 118]); // hsl(194.4, 16.56%, 39.61%)
    const baseDark = await resolve('base', { darkMode: true });
    near(baseDark.rgba('cScalePeer0'), [145, 98, 0]); // hsl(40.59, 100%, 28.33%)
  });

  it('keeps an author cScalePeer<n> as v12 did', async () => {
    const t = await resolve('base', { cScalePeer3: '#123456' });
    expect(t.value('cScalePeer3')).toBe('#123456');
    near(t.rgba('cScalePeer2'), (await resolve('base')).rgba('cScalePeer2')!);
  });

  it('takes the title colour from titleColor and 14 px, set flat or under treemap (D407, D540)', async () => {
    const base = await resolve('neutral');
    expect(base.value('treemapTitleColor')).toBe(base.value('titleColor'));
    expect(base.number('treemapTitleFontSize')).toBe(14);
    for (const name of ['redux-color', 'neo-dark'] as const)
      expect((await resolve(name)).number('treemapTitleFontSize'), name).toBe(14);
    const nested = await resolve('neutral', {
      treemap: { titleColor: '#ff0000', titleFontSize: 20 },
    });
    expect(nested.value('treemapTitleColor')).toBe('#ff0000');
    expect(nested.number('treemapTitleFontSize')).toBe(20);
    const flat = await resolve('neutral', {
      treemapTitleColor: '#00ff00',
      treemap: { titleColor: '#ff0000' },
    });
    expect(flat.value('treemapTitleColor')).toBe('#00ff00');
  });
});
