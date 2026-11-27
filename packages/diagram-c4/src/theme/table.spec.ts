/**
 * C4's relation-label tag variables (#1351, D713, D714, D715): `c4EdgeLabelBackground` and
 * `c4EdgeLabelColor` resolve through `createTheme` in the built-in themes, and
 * `c4RelationColor` takes its default from `textColor`.
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import {
  THEME_NAMES,
  contrastRatio,
  createTheme,
  loadTheme,
  parseColor,
} from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { c4 } from '../plugin.ts';

const { theme: table }: Pick<DiagramPlugin, 'id' | 'theme'> = c4;

const themed = async (name: string, themeVariables?: Record<string, unknown>) =>
  createTheme(await loadTheme(name as 'default'), {
    diagram: table,
    themeVariables,
    cssVariables: false,
  });

describe('the C4 relation-label tag variables', () => {
  it('fills the C4 tag with edgeLabelBackground and inks it with textColor (#1351, D713, D715)', async () => {
    // [ink, fill, c4RelationColor] with no override.
    const TAG: Record<string, [string, string, string]> = {
      default: ['#333333', '#ffffff', '#333333'],
      dark: ['#cccccc', '#333333', '#cccccc'],
      forest: ['#000000', '#ffffff', '#000000'],
      neutral: ['#000000', '#ffffff', '#000000'],
      base: ['#333333', '#f4f4f4', '#333333'],
      redux: ['#28253d', '#ffffff', '#28253d'],
      'redux-color': ['#28253d', '#ffffff', '#28253d'],
      'redux-dark': ['#cccccc', '#333333', '#cccccc'],
      'redux-dark-color': ['#cccccc', '#333333', '#cccccc'],
      neo: ['#333333', '#ffffff', '#333333'],
      'neo-dark': ['#cccccc', '#333333', '#cccccc'],
    };
    expect(THEME_NAMES).toHaveLength(11);
    for (const name of THEME_NAMES) {
      const t = await themed(name);
      expect(
        [t.value('c4EdgeLabelColor'), t.value('c4EdgeLabelBackground'), t.value('c4RelationColor')],
        name
      ).toEqual(TAG[name]);
      expect(TAG[name], name).toEqual([
        t.value('textColor'),
        t.value('edgeLabelBackground'),
        t.value('textColor'),
      ]);
    }
  });

  it('follows textColor for the relation colour, also under darkMode (D714)', async () => {
    const own = await themed('default', { textColor: '#102030' });
    expect(own.value('c4RelationColor')).toBe('#102030');
    const dark = await themed('base', { darkMode: true, textColor: '#e0e0e0' });
    expect(dark.value('c4RelationColor')).toBe('#e0e0e0');
  });

  it('follows edgeLabelBackground, and c4EdgeLabelBackground for C4 alone (D715)', async () => {
    const shared = await themed('default', { edgeLabelBackground: '#ffe0a0' });
    expect(shared.value('c4EdgeLabelBackground')).toBe('#ffe0a0');
    const own = await themed('default', { c4EdgeLabelBackground: '#a0e0ff' });
    expect([own.value('c4EdgeLabelBackground'), own.value('edgeLabelBackground')]).toEqual([
      '#a0e0ff',
      '#ffffff',
    ]);
  });

  it('keeps the tag ink readable on a light tag under a dark theme (D713)', async () => {
    for (const vars of [{ background: '#fafafa' }, { edgeLabelBackground: '#fafafa' }]) {
      const t = await themed('dark', vars);
      const ink = parseColor(t.value('c4EdgeLabelColor'))!;
      const fill = parseColor(t.value('c4EdgeLabelBackground'))!;
      expect(contrastRatio(ink, fill), JSON.stringify(vars)).toBeGreaterThanOrEqual(4.5);
    }
    // An author's own ink wins as written.
    const own = await themed('dark', { c4EdgeLabelColor: '#123456' });
    expect(own.value('c4EdgeLabelColor')).toBe('#123456');
  });
});
