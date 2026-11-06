/**
 * ER's own theme variables (spec #414 T3, D331): its row fills, edge label background, zero
 * circle fill and crow's-foot geometry live in the plugin's table, keyed by family, and resolve
 * through `createTheme` as in v12.
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import { THEME_VARIABLES, createTheme, loadTheme } from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { er } from '../plugin.ts';

const { theme: table }: Pick<DiagramPlugin, 'id' | 'theme'> = er;
const OWN = [
  'rowOdd',
  'rowEven',
  'erEdgeLabelBackground',
  'erMarkerFill',
  'erZeroOrMoreCircleOffset',
];

const themed = async (name: string, themeVariables?: Record<string, unknown>) =>
  createTheme(await loadTheme(name as 'default'), {
    diagram: table,
    themeVariables,
    cssVariables: false,
  });

describe('the ER theme table (#414 T3)', () => {
  it('owns its variables; core no longer names them', () => {
    expect(Object.keys(table.vars).sort()).toEqual([...OWN].sort());
    for (const name of OWN) expect(THEME_VARIABLES[name], name).toBeUndefined();
  });

  it('places the zero-or-more circle as v12 neo in redux and neo, classic elsewhere', async () => {
    for (const name of ['default', 'dark', 'base'])
      expect((await themed(name)).number('erZeroOrMoreCircleOffset'), name).toBe(30);
    for (const name of ['redux', 'redux-dark-color', 'neo', 'neo-dark'])
      expect((await themed(name)).number('erZeroOrMoreCircleOffset'), name).toBe(28);
  });

  it('fills rows and the zero circle with the entity fill in redux and neo, as v12 neo', async () => {
    for (const name of ['redux', 'redux-dark', 'neo', 'neo-dark']) {
      const t = await themed(name, { mainBkg: '#123456' });
      expect([t.value('rowOdd'), t.value('rowEven'), t.value('erMarkerFill')], name).toEqual([
        '#123456',
        '#123456',
        '#123456',
      ]);
    }
    for (const name of ['default', 'dark', 'neutral'])
      expect((await themed(name)).value('erMarkerFill'), name).toBe('#ffffff');
  });

  it('draws edge labels on a plain fill in the colour themes, on edgeLabelBackground elsewhere', async () => {
    expect((await themed('redux-color')).value('erEdgeLabelBackground')).toBe('#ffffff');
    expect((await themed('redux-dark-color')).value('erEdgeLabelBackground')).toBe('#16141f');
    for (const name of ['redux', 'redux-dark', 'default', 'neo']) {
      const t = await themed(name, { edgeLabelBackground: '#abcdef' });
      expect(t.value('erEdgeLabelBackground'), name).toBe('#abcdef');
    }
  });

  it('keeps each classic theme row shape: derived, pinned, or from primaryColor', async () => {
    // neutral and dark set the rows once from their own colours, so they never follow mainBkg.
    const neutral = await themed('neutral', { mainBkg: '#000000' });
    expect([neutral.value('rowOdd'), neutral.value('rowEven')]).toEqual(['#ffffff', '#f4f4f4']);
    const dark = await themed('dark', { mainBkg: '#ffffff' });
    expect([dark.value('rowOdd'), dark.value('rowEven')]).toEqual(['#2c2d2d', '#060606']);
    // default derives them from primaryColor, base and forest from mainBkg.
    const own = (await themed('default')).value('rowEven');
    expect((await themed('default', { mainBkg: '#000000' })).value('rowEven')).toBe(own);
    expect((await themed('base', { mainBkg: '#000000' })).value('rowEven')).toBe('#0d0d0d');
    expect((await themed('forest', { mainBkg: '#000000' })).value('rowEven')).toBe('#333333');
  });
});
