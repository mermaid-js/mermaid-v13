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
const OWN = ['compositeBackground', 'compositeTitleBackground', 'altBackground'];

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

  it('takes themeVariables overrides', async () => {
    const t = await themed('redux-color', {
      compositeTitleBackground: '#ff0000',
      altBackground: '#00ff00',
    });
    expect(t.value('compositeTitleBackground')).toBe('#ff0000');
    expect(t.value('altBackground')).toBe('#00ff00');
  });
});
