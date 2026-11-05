import { describe, expect, it } from 'vitest';
import { createTheme, loadTheme, type ThemeName, type ThemeWarning } from './index.ts';

// v12 12.2.0 `theme-redux-color.js` / `theme-redux-dark-color.js`, written out by hand.
const BORDER_400 = [
  '#e879f9',
  '#2dd4bf',
  '#fb923c',
  '#22d3ee',
  '#4ade80',
  '#a78bfa',
  '#f87171',
  '#facc15',
  '#818cf8',
  '#a3e635',
  '#38bdf8',
  '#fb7185',
];
const BKG_50 = [
  '#fdf4ff',
  '#f0fdfa',
  '#fff7ed',
  '#ecfeff',
  '#f0fdf4',
  '#f5f3ff',
  '#fef2f2',
  '#fefce8',
  '#eef2ff',
  '#f7fee7',
  '#f0f9ff',
  '#fff1f2',
];
const C_SCALE_300 = [
  '#f4a8ff',
  '#46ecd5',
  '#ffb86a',
  '#dab2ff',
  '#7bf1a8',
  '#c4b4ff',
  '#ffa2a2',
  '#ffdf20',
  '#a3b3ff',
  '#bbf451',
  '#74d4ff',
  '#ffa1ad',
];

const literal = async (name: ThemeName, themeVariables?: Record<string, unknown>) =>
  createTheme(await loadTheme(name), { cssVariables: false, themeVariables });

describe('the redux family (D151)', () => {
  it('redux keeps its monochrome values and carries no palette', async () => {
    const t = await literal('redux');
    expect(t.value('nodeBorder')).toBe('#28253d');
    expect(t.value('primaryBorderColor')).toBe('#28253d');
    expect(t.value('mainBkg')).toBe('#ffffff');
    expect(t.value('clusterBkg')).toBe('#f9f9fb');
    expect(t.value('clusterBorder')).toBe('#bdbccc');
    expect(t.value('noteBkgColor')).toBe('#fff5ad');
    expect(t.palette('borderColorArray')).toEqual([]);
    expect(t.palette('bkgColorArray')).toEqual([]);
    expect(t.palette('cScale')).toEqual([]);
  });

  it('redux-color carries the v12 redux-color values and palettes', async () => {
    const t = await literal('redux-color');
    expect(t.name).toBe('redux-color');
    expect(t.dark).toBe(false);
    expect(t.value('primaryColor')).toBe('#cccccc');
    expect(t.value('nodeBorder')).toBe('#28253d');
    expect(t.value('mainBkg')).toBe('#ffffff');
    expect(t.value('noteBkgColor')).toBe('#fff5ad');
    expect(t.value('noteBorderColor')).toBe('#facc15');
    expect(t.value('lineColor')).toBe('#000000');
    expect(t.number('strokeWidth')).toBe(2);
    expect(t.number('radius')).toBe(12);
    expect(t.palette('borderColorArray')).toEqual(BORDER_400);
    expect(t.palette('bkgColorArray')).toEqual(BKG_50);
    expect(t.palette('cScale')).toEqual(C_SCALE_300);
  });

  it.each(['redux-dark', 'redux-dark-color'] as const)(
    '%s carries the v12 redux-dark values',
    async (name) => {
      const t = await literal(name);
      expect(t.dark).toBe(true);
      expect(t.value('background')).toBe('#333333');
      expect(t.value('mainBkg')).toBe('#111113');
      expect(t.value('nodeBorder')).toBe('#ffffff');
      expect(t.value('nodeTextColor')).toBe('#e0dfdf');
      expect(t.value('clusterBkg')).toBe('#1e1a2e');
      expect(t.value('clusterBorder')).toBe('#bdbccc');
      expect(t.value('lineColor')).toBe('#cccccc');
      expect(t.value('edgeLabelBackground')).toBe('#474949');
      expect(t.value('noteBkgColor')).toBe('#fef9c3');
      expect(t.number('strokeWidth')).toBe(2);
    }
  );

  it('redux-dark-color has the border palette and an empty fill palette', async () => {
    const t = await literal('redux-dark-color');
    expect(t.palette('borderColorArray')).toEqual(BORDER_400);
    expect(t.palette('bkgColorArray')).toEqual([]);
    expect(t.palette('cScale')).toEqual(C_SCALE_300);
    expect((await literal('redux-dark')).palette('borderColorArray')).toEqual([]);
  });

  it.each(['default', 'dark', 'forest', 'neutral', 'base', 'neo'] as const)(
    '%s carries no palette',
    async (name) => {
      const t = await literal(name);
      expect(t.palette('borderColorArray')).toEqual([]);
      expect(t.palette('bkgColorArray')).toEqual([]);
      expect(t.palette('cScale')).toEqual([]);
    }
  );
});

describe('palette overrides through themeVariables (D152)', () => {
  it('replaces a whole palette from an array or a comma-separated string', async () => {
    const a = await literal('redux-color', { borderColorArray: ['#ff0000', 'blue'] });
    expect(a.palette('borderColorArray')).toEqual(['#ff0000', 'blue']);
    const b = await literal('default', { bkgColorArray: '#111111, #222222' });
    expect(b.palette('bkgColorArray')).toEqual(['#111111', '#222222']);
    const empty = await literal('redux-color', { bkgColorArray: [] });
    expect(empty.palette('bkgColorArray')).toEqual([]);
  });

  it('replaces one cScale entry by its v12 name', async () => {
    const t = await literal('redux-color', { cScale3: '#123456' });
    expect(t.palette('cScale')).toEqual([
      ...C_SCALE_300.slice(0, 3),
      '#123456',
      ...C_SCALE_300.slice(4),
    ]);
  });

  it('drops an unsafe palette with THEME_VARIABLE_DROPPED and keeps the theme value', async () => {
    const warnings: ThemeWarning[] = [];
    const t = createTheme(await loadTheme('redux-color'), {
      cssVariables: false,
      themeVariables: { borderColorArray: ['#ff0000', 'url(#x)'], cScale0: 'red;x' },
      warn: (w) => warnings.push(w),
    });
    expect(t.palette('borderColorArray')).toEqual(BORDER_400);
    expect(t.palette('cScale')[0]).toBe('#f4a8ff');
    expect(warnings.map((w) => w.code)).toEqual([
      'THEME_VARIABLE_DROPPED',
      'THEME_VARIABLE_DROPPED',
    ]);
  });
});
