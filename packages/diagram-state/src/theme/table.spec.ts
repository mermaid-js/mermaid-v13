/**
 * State's own theme variables (spec #414 T3, D331, D337): the composite-state backgrounds of
 * #192 (D120, D126) live in the plugin's table, keyed by family, and resolve through
 * `createTheme` as in v12.
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import { THEME_VARIABLES, createTheme, loadTheme } from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { state } from '../plugin.ts';

const { theme: table }: Pick<DiagramPlugin, 'id' | 'theme'> = state;
const OWN = [
  'compositeBackground',
  'compositeTitleBackground',
  'altBackground',
  'stateLabelColor',
  'compositeTitleColor',
];

const themed = async (name: string, themeVariables?: Record<string, unknown>) =>
  createTheme(await loadTheme(name as 'default'), {
    diagram: table,
    themeVariables,
    cssVariables: false,
  });

describe('the state theme table (#414 T3)', () => {
  it('owns its variables; core no longer names them', () => {
    expect(Object.keys(table.vars).sort()).toEqual([...OWN].sort());
    for (const name of OWN) expect(THEME_VARIABLES[name], name).toBeUndefined();
  });

  // v12 12.2.0 theme-*.js: the redux themes pin both; the classic ones derive the title strip
  // from mainBkg and give altBackground a literal (base: tertiaryColor). neo-dark: D189.
  it.each([
    ['redux', '#f9f9fb', '#f9f9fb'],
    ['redux-color', '#f9f9fb', '#f9f9fb'],
    ['redux-dark', '#16141f', '#16141f'],
    ['redux-dark-color', '#16141f', '#16141f'],
    ['default', '#ececff', '#f0f0f0'],
    ['dark', '#1f2020', '#555555'],
    ['forest', '#cde498', '#f0f0f0'],
    ['neutral', '#eeeeee', '#f4f4f4'],
    ['base', '#fff4dd', '#f6f9ff'],
    ['neo', '#ffffff', '#f0f0f0'],
    ['neo-dark', '#2a2020', '#404040'],
  ] as const)('%s: compositeTitleBackground %s, altBackground %s', async (name, title, alt) => {
    const t = await themed(name);
    expect(t.value('compositeTitleBackground')).toBe(title);
    expect(t.value('altBackground')).toBe(alt);
  });

  // D126: v12's compositeBackground is the theme background, except on the dark redux themes.
  it.each([
    ['redux', '#ffffff'],
    ['redux-color', '#ffffff'],
    ['redux-dark', '#16141f'],
    ['redux-dark-color', '#16141f'],
    ['default', '#ffffff'],
    ['dark', '#333333'],
    ['forest', '#ffffff'],
    ['neutral', '#ffffff'],
    ['base', '#f4f4f4'],
    ['neo', '#ffffff'],
    ['neo-dark', '#333333'],
  ] as const)('%s: compositeBackground %s (D126)', async (name, body) => {
    expect((await themed(name)).value('compositeBackground')).toBe(body);
  });

  it('derives the body from background, the classic strip from mainBkg, base nesting from tertiaryColor', async () => {
    const body = await themed('default', { background: '#abcdef' });
    expect(body.value('compositeBackground')).toBe('#abcdef');
    const strip = await themed('default', { mainBkg: '#123456' });
    expect(strip.value('compositeTitleBackground')).toBe('#123456');
    const nested = await themed('base', { tertiaryColor: '#c0ffee' });
    expect(nested.value('altBackground')).toBe('#c0ffee');
  });

  // D638, #827: v12 drew state text and composite titles in `stateLabelColor`, which fell to
  // `primaryTextColor` in every classic theme (`stateBkg` was still unset when it ran). The
  // redux and neo families keep `nodeTextColor` and `titleColor`.
  it.each([
    ['default', '#131300', '#131300'],
    ['dark', '#e0dfdf', '#e0dfdf'],
    ['forest', '#321b67', '#321b67'],
    ['neutral', '#111111', '#111111'],
    ['base', '#333333', '#333333'],
    ['redux', '#28253d', '#28253d'],
    ['redux-color', '#28253d', '#28253d'],
    ['redux-dark', '#e0dfdf', '#dfe0e0'],
    ['redux-dark-color', '#e0dfdf', '#dfe0e0'],
    ['neo', '#333333', '#000000'],
    ['neo-dark', '#e0dfdf', '#dfe0e0'],
  ] as const)(
    '%s: stateLabelColor %s, compositeTitleColor %s (D638)',
    async (name, text, title) => {
      const t = await themed(name);
      expect(t.value('stateLabelColor')).toBe(text);
      expect(t.value('compositeTitleColor')).toBe(title);
    }
  );

  it('follows primaryTextColor in the classic family, and stateLabelColor recolours titles (D638)', async () => {
    const t = await themed('neutral', { primaryTextColor: '#123456' });
    expect(t.value('stateLabelColor')).toBe('#123456');
    expect(t.value('compositeTitleColor')).toBe('#123456');
    const own = await themed('default', { stateLabelColor: '#654321' });
    expect(own.value('compositeTitleColor')).toBe('#654321');
    // The other families read nodeTextColor and titleColor, whatever those follow.
    const redux = await themed('redux', { nodeTextColor: '#123456', titleColor: '#abcdef' });
    expect(redux.value('stateLabelColor')).toBe('#123456');
    expect(redux.value('compositeTitleColor')).toBe('#abcdef');
  });

  it('takes themeVariables overrides', async () => {
    const t = await themed('redux-color', {
      compositeTitleBackground: '#ff0000',
      altBackground: '#00ff00',
    });
    expect(t.value('compositeTitleBackground')).toBe('#ff0000');
    expect(t.value('altBackground')).toBe('#00ff00');
  });
});
