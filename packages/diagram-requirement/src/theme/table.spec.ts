/**
 * Requirement's theme table (spec #520 T4, D331, D435): the seven documented variables take
 * their v12 drawn values by rule, and the relation geometry follows the family (D152). Expected
 * values are what mermaid\@12.2.0 draws (rendered in headless Chromium, `look: classic` for the
 * classic themes and `look: neo` for the rest): classic lines 1px, box stroke 1.3, a 20 × 20
 * chevron with 1px strokes; neo lines and marker strokes `strokeWidth`, the chevron at 0.8.
 */
import { createTheme, loadTheme, THEME_NAMES, THEME_VARIABLES } from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { theme as table } from './table.ts';

const OWN = [
  'requirementBackground',
  'requirementBorderColor',
  'requirementBorderSize',
  'requirementTextColor',
  'relationLabelBackground',
  'relationColor',
  'relationLabelColor',
  'relationStrokeWidth',
  'relationMarkerStrokeWidth',
  'relationArrowScale',
];
const CLASSIC = ['default', 'dark', 'forest', 'neutral', 'base'] as const;
const REDUX = ['redux', 'redux-dark', 'redux-color', 'redux-dark-color'] as const;
const NEO = ['neo', 'neo-dark'] as const;

const themed = async (name: string, themeVariables?: Record<string, unknown>) =>
  createTheme(await loadTheme(name as 'default'), {
    diagram: table,
    themeVariables,
    cssVariables: false,
  });

const geometry = (t: Awaited<ReturnType<typeof themed>>) =>
  [
    'requirementBorderSize',
    'relationStrokeWidth',
    'relationMarkerStrokeWidth',
    'relationArrowScale',
  ].map((n) => t.number(n));

describe('the requirement theme table (D435)', () => {
  it('owns its variables; core names none of them', () => {
    expect(Object.keys(table.vars).sort()).toEqual([...OWN].sort());
    for (const name of OWN) expect(THEME_VARIABLES[name], name).toBeUndefined();
  });

  it('resolves every variable in every theme', async () => {
    for (const name of THEME_NAMES) {
      const t = await themed(name);
      for (const v of OWN) expect(t.value(v), `${name} ${v}`).not.toBe('');
    }
  });

  it('draws v12 classic geometry in the classic themes and v12 neo in redux and neo', async () => {
    for (const name of CLASSIC) expect(geometry(await themed(name)), name).toEqual([1.3, 1, 1, 1]);
    for (const name of [...REDUX, ...NEO])
      expect(geometry(await themed(name)), name).toEqual([2, 2, 2, 0.8]);
  });

  it('widens the neo lines, markers and outline with strokeWidth, never the classic ones', async () => {
    expect(geometry(await themed('redux', { strokeWidth: 5 }))).toEqual([5, 5, 5, 0.8]);
    expect(geometry(await themed('default', { strokeWidth: 5 }))).toEqual([1.3, 1, 1, 1]);
    expect(
      geometry(await themed('neo', { requirementBorderSize: 3, relationArrowScale: 1 }))
    ).toEqual([3, 2, 2, 1]);
  });

  it('colours boxes, text and relations as v12 drew them, following their shared inputs', async () => {
    const t = await themed('default');
    expect(
      [
        'requirementBackground',
        'requirementBorderColor',
        'requirementTextColor',
        'relationColor',
      ].map((v) => t.value(v))
    ).toEqual(['#ececff', '#9370db', '#333333', '#333333']);
    const dark = await themed('dark');
    expect([dark.value('relationColor'), dark.value('relationLabelColor')]).toEqual([
      '#d3d3d3',
      '#cccccc',
    ]);
    // v12 neo-dark's HTML label ink is nodeTextColor, not textColor.
    const neoDark = await themed('neo-dark');
    expect([neoDark.value('requirementTextColor'), neoDark.value('relationLabelColor')]).toEqual([
      '#e0dfdf',
      '#e0dfdf',
    ]);
    const o = await themed('redux', {
      mainBkg: '#123456',
      nodeBorder: '#654321',
      nodeTextColor: '#abcdef',
      lineColor: '#fedcba',
    });
    expect(
      [
        'requirementBackground',
        'requirementBorderColor',
        'requirementTextColor',
        'relationColor',
        'relationLabelColor',
      ].map((v) => o.value(v))
    ).toEqual(['#123456', '#654321', '#abcdef', '#fedcba', '#abcdef']);
    const own = await themed('neo', { requirementBackground: '#010203', relationColor: '#040506' });
    expect([own.value('requirementBackground'), own.value('relationColor')]).toEqual([
      '#010203',
      '#040506',
    ]);
  });

  it("puts relation labels on v12's chip: white or #16141f in redux, edgeLabelBackground elsewhere", async () => {
    // v12 `.labelBkg` reads `requirementEdgeLabelBackground`, which only the redux themes set.
    for (const name of ['redux', 'redux-color'])
      expect((await themed(name)).value('relationLabelBackground'), name).toBe('#ffffff');
    for (const name of ['redux-dark', 'redux-dark-color'])
      expect((await themed(name)).value('relationLabelBackground'), name).toBe('#16141f');
    for (const name of [...CLASSIC, ...NEO]) {
      const t = await themed(name, { edgeLabelBackground: '#abcdef' });
      expect(t.value('relationLabelBackground'), name).toBe('#abcdef');
    }
    expect((await themed('default')).value('relationLabelBackground')).toBe('#e8e8e8cc');
    expect((await themed('neo-dark')).value('relationLabelBackground')).toBe('#323333');
  });
});
