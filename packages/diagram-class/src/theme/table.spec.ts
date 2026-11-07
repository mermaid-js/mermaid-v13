/**
 * Class's own theme variables (spec #414 T2, D331): its text colour, marker geometry and
 * multiplicity size live in the plugin's table, keyed by family, never by theme name.
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import { THEME_VARIABLES, createTheme, loadTheme } from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { classDiagram } from '../plugin.ts';

const { theme: table }: Pick<DiagramPlugin, 'id' | 'theme'> = classDiagram;
const MARKERS = [
  'classMarkerStrokeWidth',
  'classFilledMarkerStrokeWidth',
  'extensionMarkerLength',
  'extensionMarkerGap',
  'compositionMarkerGap',
  'dependencyMarkerGap',
];
const OWN = ['classText', 'classTerminalFontSize', ...MARKERS];

const themed = async (name: string, themeVariables?: Record<string, unknown>) =>
  createTheme(await loadTheme(name as 'default'), {
    diagram: table,
    themeVariables,
    cssVariables: false,
  });

describe('the class theme table (#414 T2)', () => {
  it('owns its variables; core no longer names them', () => {
    expect(Object.keys(table.vars).sort()).toEqual([...OWN].sort());
    for (const name of OWN) expect(THEME_VARIABLES[name], name).toBeUndefined();
  });

  it('draws v12 neo markers in the redux and neo families, classic ones elsewhere', async () => {
    const markers = async (name: string) => {
      const t = await themed(name);
      return MARKERS.map((m) => t.number(m));
    };
    expect(await markers('base')).toEqual([1, 1, 17, 0.25, 0.25, 1]);
    for (const name of ['redux-color', 'redux-dark', 'neo', 'neo-dark'])
      expect(await markers(name), name).toEqual([2, 0, 8, 8.25, 2.75, 4]);
    for (const name of ['default', 'redux', 'neo'])
      expect((await themed(name)).number('classTerminalFontSize'), name).toBe(11);
  });

  it('takes classText from primaryTextColor in classic, from textColor in redux and neo', async () => {
    const vars = { primaryTextColor: '#111111', textColor: '#222222' };
    expect((await themed('neutral', vars)).value('classText')).toBe('#111111');
    for (const name of ['redux', 'neo-dark'])
      expect((await themed(name, vars)).value('classText'), name).toBe('#222222');
  });
});
