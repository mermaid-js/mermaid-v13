import { describe, expect, it } from 'vitest';
import {
  NUMBERED_PALETTES,
  PALETTE_LIMITS,
  THEME_NAMES,
  createTheme,
  loadTheme,
  parseColor,
  type ThemeName,
  type ThemeWarning,
} from './index.ts';

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
  it('redux keeps its monochrome values and carries no per-subgraph palette', async () => {
    const t = await literal('redux');
    expect(t.value('nodeBorder')).toBe('#28253d');
    expect(t.value('primaryBorderColor')).toBe('#28253d');
    expect(t.value('mainBkg')).toBe('#ffffff');
    expect(t.value('clusterBkg')).toBe('#f9f9fb');
    expect(t.value('clusterBorder')).toBe('#bdbccc');
    expect(t.value('noteBkgColor')).toBe('#fff5ad');
    expect(t.palette('borderColorArray')).toEqual([]);
    expect(t.palette('bkgColorArray')).toEqual([]);
    // v12 theme-redux.js: every slot is mainBkg darkened by 25 (D258).
    expect(t.palette('cScale')).toEqual(Array(12).fill('#bfbfbf'));
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

  it.each(['default', 'dark', 'forest', 'neutral', 'base', 'neo', 'neo-dark'] as const)(
    '%s carries no per-subgraph palette, and twelve cScale slots (D258)',
    async (name) => {
      const t = await literal(name);
      expect(t.palette('borderColorArray')).toEqual([]);
      expect(t.palette('bkgColorArray')).toEqual([]);
      for (const p of ['cScale', 'cScaleInv', 'cScaleLabel'] as const)
        expect(t.palette(p), p).toHaveLength(12);
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

  it('replaces one cScaleInv or cScaleLabel entry by its v12 name (D258)', async () => {
    const t = await literal('neutral', { cScaleInv2: '#123456', cScaleLabel11: 'red' });
    expect(t.palette('cScaleInv')[2]).toBe('#123456');
    expect(t.palette('cScaleLabel')[11]).toBe('red');
    expect(t.palette('cScaleLabel')[10]).toBe('#333333');
  });

  it('ignores a numbered name with a leading zero, as v12 does (R-CONF-5)', async () => {
    const warnings: ThemeWarning[] = [];
    const t = createTheme(await loadTheme('neutral'), {
      cssVariables: false,
      themeVariables: { cScale05: '#123456', cScaleInv012: '#123456' },
      warn: (w) => warnings.push(w),
    });
    expect(t.palette('cScale')[5]).toBe('#999999');
    expect(warnings).toEqual([]);
  });

  it.each(THEME_NAMES)(
    '%s: every slot of the numbered palettes is a safe colour (cScale*, git*)',
    async (name) => {
      for (const darkMode of [false, true]) {
        const t = await literal(name, { darkMode });
        for (const p of NUMBERED_PALETTES) {
          const list = t.palette(p);
          expect(list, `${p} darkMode ${darkMode}`).toHaveLength(PALETTE_LIMITS[p]);
          for (const c of list) expect(parseColor(c), `${p} ${c}`).toBeDefined();
        }
      }
    }
  );

  it('derives cScaleInv and cScaleLabel from the cScale the author gives (D258)', async () => {
    const t = await literal('neutral', { cScale: ['#000000', '#ffffff'] });
    expect(t.palette('cScale')).toEqual(['#000000', '#ffffff']);
    // Past the author's list, an entry derives from the theme's own slot (#555555).
    expect(t.palette('cScaleInv').slice(0, 3)).toEqual(['#ffffff', '#000000', '#aaaaaa']);
    // v12 theme-neutral: labels 0 and 2 are cScale1.
    expect(t.palette('cScaleLabel')[0]).toBe('#ffffff');
  });

  it('derives cScale from primaryColor where v12 does (D258)', async () => {
    // khroma darken('#ff0000', 25) is hsl(0, 100%, 25%).
    expect((await literal('base', { primaryColor: '#ff0000' })).palette('cScale')[0]).toBe(
      '#800000'
    );
    expect((await literal('default', { primaryColor: '#ff0000' })).palette('cScale')[0]).toBe(
      '#8686ff'
    );
  });

  it("switches to the darkMode palettes on the author's darkMode only (D258)", async () => {
    expect((await literal('dark')).palette('cScaleLabel')[1]).toBe('#d3d3d3');
    expect((await literal('dark', { darkMode: true })).palette('cScaleLabel')[1]).toBe('#000000');
  });

  it('drops an unsafe palette with THEME_VARIABLE_DROPPED and keeps the theme value', async () => {
    const warnings: ThemeWarning[] = [];
    const t = createTheme(await loadTheme('redux-color'), {
      cssVariables: false,
      themeVariables: {
        borderColorArray: ['#ff0000', 'url(#x)'],
        cScale0: 'red;x',
        cScaleLabel1: 'url(#x)',
      },
      warn: (w) => warnings.push(w),
    });
    expect(t.palette('borderColorArray')).toEqual(BORDER_400);
    expect(t.palette('cScale')[0]).toBe('#f4a8ff');
    expect(t.palette('cScaleLabel')[1]).toBe('#28253d');
    expect(warnings.map((w) => w.code)).toEqual([
      'THEME_VARIABLE_DROPPED',
      'THEME_VARIABLE_DROPPED',
      'THEME_VARIABLE_DROPPED',
    ]);
  });

  it('has eight git, gitInv and gitBranchLabel slots, named git0–git7 (D267)', async () => {
    const t = await literal('redux-color', { git8: '#123456', gitInv8: '#123456', git3: 'red' });
    expect(t.palette('git')).toHaveLength(8);
    expect(t.palette('gitInv')).toHaveLength(8);
    expect(t.palette('gitBranchLabel')).toHaveLength(8);
    expect(t.palette('git')[3]).toBe('red');
    expect(t.palette('git')).not.toContain('#123456');
    expect(t.palette('gitInv')).not.toContain('#123456');
  });

  it('replaces the whole git palette with a list, and gitInv follows it (D267)', async () => {
    const t = await literal('base', { git: '#000000, #ffffff' });
    expect(t.palette('git')).toEqual(['#000000', '#ffffff']);
    // khroma darken by 25, then invert: #000000 stays black, so its inverse is white.
    expect(t.palette('gitInv').slice(0, 2)).toEqual(['#ffffff', '#404040']);
    expect(t.palette('gitInv')).toHaveLength(8);
  });

  it('drops an unsafe git colour with THEME_VARIABLE_DROPPED and keeps the theme value', async () => {
    const warnings: ThemeWarning[] = [];
    const t = createTheme(await loadTheme('redux-color'), {
      cssVariables: false,
      themeVariables: { git0: 'red;x', gitBranchLabel1: 'url(#x)', gitInv: ['#000', 'x(y)'] },
      warn: (w) => warnings.push(w),
    });
    const plain = await literal('redux-color');
    expect(t.palette('git')).toEqual(plain.palette('git'));
    expect(t.palette('gitInv')).toEqual(plain.palette('gitInv'));
    expect(t.palette('gitBranchLabel')).toEqual(plain.palette('gitBranchLabel'));
    expect(warnings.map((w) => w.message.split(' ')[0])).toEqual([
      'themeVariables.gitInv',
      'themeVariables.git0',
      'themeVariables.gitBranchLabel1',
    ]);
    expect(new Set(warnings.map((w) => w.code))).toEqual(new Set(['THEME_VARIABLE_DROPPED']));
  });
});
