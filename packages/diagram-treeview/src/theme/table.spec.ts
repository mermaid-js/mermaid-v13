/**
 * TreeView's own theme table (spec #518 T4, D483, D540): v12 `styles.ts`'s seven values in every
 * light theme, the dark entry (`textColor`, `lineColor`, `#90a4ae`) in every dark theme, by the
 * `dark` trait (v12 never varied them, so the author's `darkMode` does not), under the `treeView`
 * section. T5's oracle spec compares all eleven themes with v12.
 */
import { createTheme, loadTheme, type ThemeName } from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { theme as table } from './table.ts';

const resolve = async (name: ThemeName, themeVariables?: Record<string, unknown>) =>
  createTheme(await loadTheme(name), {
    diagram: table,
    cssVariables: false,
    ...(themeVariables ? { themeVariables } : {}),
  });

const NAMES = [
  'treeViewLabelColor',
  'treeViewLineColor',
  'treeViewIconColor',
  'treeViewDescriptionColor',
  'treeViewHighlightBg',
  'treeViewHighlightStroke',
] as const;

/** v12's values (`styles.ts`). */
const V12 = ['black', 'black', '#546e7a', '#6a9955', 'rgba(255, 193, 7, 0.15)', '#ffc107'];

const LIGHT: readonly ThemeName[] = [
  'default',
  'forest',
  'neutral',
  'base',
  'redux',
  'redux-color',
  'neo',
];
const DARK: readonly ThemeName[] = ['dark', 'redux-dark', 'redux-dark-color', 'neo-dark'];

describe('treeView theme table', () => {
  it("is v12's values and 16 px in every light theme, darkMode included", async () => {
    for (const name of LIGHT) {
      const t = await resolve(name);
      expect(
        NAMES.map((n) => t.value(n)),
        name
      ).toEqual(V12);
      expect(t.number('treeViewLabelFontSize'), name).toBe(16);
    }
    const darkMode = await resolve('base', { darkMode: true });
    expect(NAMES.map((n) => darkMode.value(n))).toEqual(V12);
  });

  it("takes the theme's textColor and lineColor and blue grey 300 icons in every dark theme (D483)", async () => {
    for (const name of DARK) {
      const t = await resolve(name);
      expect(t.value('treeViewLabelColor'), name).toBe(t.value('textColor'));
      expect(t.value('treeViewLineColor'), name).toBe(t.value('lineColor'));
      expect(t.value('treeViewIconColor'), name).toBe('#90a4ae');
      expect(
        NAMES.slice(3).map((n) => t.value(n)),
        name
      ).toEqual(V12.slice(3));
      expect(t.number('treeViewLabelFontSize'), name).toBe(16);
    }
    // An author's dark textColor reaches the labels.
    const ink = await resolve('dark', { textColor: '#abcdef' });
    expect(ink.value('treeViewLabelColor')).toBe('#abcdef');
  });

  it('takes every variable flat or under treeView, the flat name first (D540)', async () => {
    const nested = await resolve('default', {
      treeView: {
        labelFontSize: '20px',
        labelColor: '#000001',
        lineColor: '#000002',
        iconColor: '#000003',
        descriptionColor: '#000004',
        highlightBg: '#000005',
        highlightStroke: '#000006',
      },
    });
    expect(NAMES.map((n) => nested.value(n))).toEqual([1, 2, 3, 4, 5, 6].map((i) => `#00000${i}`));
    expect(nested.number('treeViewLabelFontSize')).toBe(20);
    const flat = await resolve('default', {
      treeViewLineColor: '#00ff00',
      treeView: { lineColor: '#ff0000' },
    });
    expect(flat.value('treeViewLineColor')).toBe('#00ff00');
  });
});
