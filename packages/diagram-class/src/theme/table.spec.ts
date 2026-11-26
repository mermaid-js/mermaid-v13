/**
 * Class's own theme variables (spec #414 T2, D331): its text colour, marker geometry and
 * multiplicity size live in the plugin's table, keyed by family, never by theme name.
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import { THEME_NAMES, THEME_VARIABLES, createTheme, loadTheme } from '@mermaid-js/core/theme';
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
const OWN = [
  'classText',
  'classEdgeLabelBackground',
  'classEdgeLabelColor',
  'classTerminalFontSize',
  ...MARKERS,
];

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

  it('fills the tag with classEdgeLabelBackground and inks it with textColor where that reads (#1327, D713, D715)', async () => {
    // [ink, fill] with no override. The fill is today's background in every theme. The ink is
    // textColor: the classic themes' classText (primaryTextColor) gave way in default (#131300),
    // dark (#e0dfdf), forest (#321b67) and neutral (#111111).
    const TAG: Record<string, [string, string]> = {
      default: ['#333333', '#ffffff'],
      dark: ['#cccccc', '#333333'],
      forest: ['#000000', '#ffffff'],
      neutral: ['#000000', '#ffffff'],
      base: ['#333333', '#f4f4f4'],
      redux: ['#28253d', '#ffffff'],
      'redux-color': ['#28253d', '#ffffff'],
      'redux-dark': ['#cccccc', '#333333'],
      'redux-dark-color': ['#cccccc', '#333333'],
      neo: ['#333333', '#ffffff'],
      'neo-dark': ['#cccccc', '#333333'],
    };
    expect(THEME_NAMES).toHaveLength(11);
    for (const name of THEME_NAMES) {
      const t = await themed(name);
      expect([t.value('classEdgeLabelColor'), t.value('classEdgeLabelBackground')], name).toEqual(
        TAG[name]
      );
    }
  });

  it('follows edgeLabelBackground, and classEdgeLabelBackground for class alone (D715)', async () => {
    const shared = await themed('default', { edgeLabelBackground: '#ffe0a0' });
    expect(shared.value('classEdgeLabelBackground')).toBe('#ffe0a0');
    const own = await themed('default', { classEdgeLabelBackground: '#a0e0ff' });
    expect([own.value('classEdgeLabelBackground'), own.value('edgeLabelBackground')]).toEqual([
      '#a0e0ff',
      '#ffffff',
    ]);
  });

  it('turns the tag ink black or white where textColor does not read on the tag (#1327, D713)', async () => {
    // The #1327 repro: white text on base's #f4f4f4 tag.
    const repro = await themed('base', {
      primaryColor: '#BB2528',
      primaryTextColor: '#fff',
      lineColor: '#F83d29',
    });
    expect(repro.value('classText')).toBe('#fff');
    expect(repro.value('classEdgeLabelColor')).toBe('#000000');
    // A dark tag under a light theme: dark textColor gives way to white.
    const dark = await themed('default', { classEdgeLabelBackground: '#202020' });
    expect(dark.value('classEdgeLabelColor')).toBe('#ffffff');
    // An author's own value wins as written.
    const own = await themed('base', { classEdgeLabelColor: '#123456' });
    expect(own.value('classEdgeLabelColor')).toBe('#123456');
  });
});
