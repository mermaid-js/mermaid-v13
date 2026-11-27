/**
 * usecase's edge-label tag variables (#1350, D713, D715): `usecaseEdgeLabelBackground` and
 * `usecaseEdgeLabelColor` resolve through `createTheme` in the built-in themes.
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
import { usecase } from '../plugin.ts';

const { theme: table }: Pick<DiagramPlugin, 'id' | 'theme'> = usecase;

const themed = async (name: string, themeVariables?: Record<string, unknown>) =>
  createTheme(await loadTheme(name as 'default'), {
    diagram: table,
    themeVariables,
    cssVariables: false,
  });

describe('the usecase edge-label tag variables', () => {
  it('fills the usecase tag with edgeLabelBackground and inks it with textColor (#1350, D713, D715)', async () => {
    // [ink, fill] with no override.
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
      expect(
        [t.value('usecaseEdgeLabelColor'), t.value('usecaseEdgeLabelBackground')],
        name
      ).toEqual(TAG[name]);
      expect(TAG[name], name).toEqual([t.value('textColor'), t.value('edgeLabelBackground')]);
    }
  });

  it('follows edgeLabelBackground, and usecaseEdgeLabelBackground for usecase alone (D715)', async () => {
    const shared = await themed('default', { edgeLabelBackground: '#ffe0a0' });
    expect(shared.value('usecaseEdgeLabelBackground')).toBe('#ffe0a0');
    const own = await themed('default', { usecaseEdgeLabelBackground: '#a0e0ff' });
    expect([own.value('usecaseEdgeLabelBackground'), own.value('edgeLabelBackground')]).toEqual([
      '#a0e0ff',
      '#ffffff',
    ]);
  });

  it('keeps the tag ink readable on a light tag under a dark theme (D713)', async () => {
    for (const vars of [{ background: '#fafafa' }, { edgeLabelBackground: '#fafafa' }]) {
      const t = await themed('dark', vars);
      const ink = parseColor(t.value('usecaseEdgeLabelColor'))!;
      const fill = parseColor(t.value('usecaseEdgeLabelBackground'))!;
      expect(contrastRatio(ink, fill), JSON.stringify(vars)).toBeGreaterThanOrEqual(4.5);
    }
    // An author's own ink wins as written.
    const own = await themed('dark', { usecaseEdgeLabelColor: '#123456' });
    expect(own.value('usecaseEdgeLabelColor')).toBe('#123456');
  });
});
