/**
 * Sequence's own theme variables (spec #414 T2, D331): its geometry and the participant and
 * fragment colours that follow a shared one live in the plugin's table, keyed by family, and
 * resolve through `createTheme` as in v12.
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import { THEME_VARIABLES, createTheme, loadTheme } from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { sequence } from '../plugin.ts';

const { theme: table }: Pick<DiagramPlugin, 'id' | 'theme'> = sequence;
const OWN = ['actorBkg', 'actorLineColor', 'labelBoxBkgColor', 'labelTextColor', 'loopTextColor'];
const GEOMETRY = [
  'actorRadius',
  'actorGlyphBand',
  'messageEndGap',
  'labelBoxExtraHeight',
  'actorFooterPadding',
];

describe('the sequence theme table (#414 T2)', () => {
  it('owns its variables; core no longer names them', () => {
    expect(Object.keys(table.vars).sort()).toEqual([...OWN, ...GEOMETRY].sort());
    for (const name of [...OWN, ...GEOMETRY]) expect(THEME_VARIABLES[name], name).toBeUndefined();
  });

  it('takes v12 neo geometry in the redux and neo families, classic elsewhere', async () => {
    const at = async (name: string) => {
      const t = createTheme(await loadTheme(name as 'default'), { diagram: table });
      return GEOMETRY.map((g) => t.number(g));
    };
    expect(await at('default')).toEqual([3, 0, 0, 0, 0]);
    expect(await at('dark')).toEqual([3, 0, 0, 0, 0]);
    for (const name of ['redux', 'redux-dark-color', 'neo', 'neo-dark'])
      expect(await at(name), name).toEqual([6, 44, 3, 15, 30]);
  });

  it('derives the participant and label colours as v12 theme-base does', async () => {
    const t = createTheme(await loadTheme('forest'), {
      diagram: table,
      themeVariables: { primaryColor: '#123456', actorTextColor: '#654321' },
      cssVariables: false,
    });
    expect(t.value('actorBkg')).toBe('#123456');
    expect(t.value('labelBoxBkgColor')).toBe('#123456');
    expect(t.value('actorLineColor')).toBe(t.value('actorBorder'));
    expect([t.value('labelTextColor'), t.value('loopTextColor')]).toEqual(['#654321', '#654321']);
  });
});
