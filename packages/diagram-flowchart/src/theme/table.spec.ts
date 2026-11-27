/**
 * Flowchart's own theme variables (D331): the fill and ink of the edge-label tag of flowchart and
 * swimlane (#1345, D713, D715) resolve through `createTheme` from the shared
 * `edgeLabelBackground` and `textColor`.
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import {
  THEME_NAMES,
  THEME_VARIABLES,
  contrastRatio,
  createTheme,
  loadTheme,
  parseColor,
} from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { flowchart } from '../plugin.ts';

const { theme: table }: Pick<DiagramPlugin, 'id' | 'theme'> = flowchart;
const OWN = ['flowchartEdgeLabelBackground', 'flowchartEdgeLabelColor'];

const themed = async (name: string, themeVariables?: Record<string, unknown>) =>
  createTheme(await loadTheme(name as 'default'), {
    diagram: table,
    themeVariables,
    cssVariables: false,
  });

describe('the flowchart theme table', () => {
  it('owns its variables; core does not name them', () => {
    expect(Object.keys(table.vars).sort()).toEqual([...OWN].sort());
    for (const name of OWN) expect(THEME_VARIABLES[name], name).toBeUndefined();
  });

  it('fills the edge-label tag with edgeLabelBackground and inks it with textColor (#1345, D713, D715)', async () => {
    // [ink, fill] with no override: the textColor and background the tag drew before.
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
        [t.value('flowchartEdgeLabelColor'), t.value('flowchartEdgeLabelBackground')],
        name
      ).toEqual(TAG[name]);
      expect(TAG[name], name).toEqual([t.value('textColor'), t.value('edgeLabelBackground')]);
    }
  });

  it('follows edgeLabelBackground, and flowchartEdgeLabelBackground for flowchart alone (D715)', async () => {
    const shared = await themed('default', { edgeLabelBackground: '#ffe0a0' });
    expect(shared.value('flowchartEdgeLabelBackground')).toBe('#ffe0a0');
    const own = await themed('default', { flowchartEdgeLabelBackground: '#a0e0ff' });
    expect([own.value('flowchartEdgeLabelBackground'), own.value('edgeLabelBackground')]).toEqual([
      '#a0e0ff',
      '#ffffff',
    ]);
  });

  it('keeps the tag ink readable on a light tag under a dark theme (D713)', async () => {
    for (const vars of [{ background: '#fafafa' }, { edgeLabelBackground: '#fafafa' }]) {
      const t = await themed('dark', vars);
      const ink = parseColor(t.value('flowchartEdgeLabelColor'))!;
      const fill = parseColor(t.value('flowchartEdgeLabelBackground'))!;
      expect(contrastRatio(ink, fill), JSON.stringify(vars)).toBeGreaterThanOrEqual(4.5);
    }
    // An author's own ink wins as written.
    const own = await themed('dark', { flowchartEdgeLabelColor: '#123456' });
    expect(own.value('flowchartEdgeLabelColor')).toBe('#123456');
  });
});
