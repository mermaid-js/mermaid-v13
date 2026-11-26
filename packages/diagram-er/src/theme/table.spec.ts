/**
 * ER's own theme variables (spec #414 T3, D331): its row fills, edge label background, zero
 * circle fill and crow's-foot geometry live in the plugin's table, keyed by family, and resolve
 * through `createTheme` as in v12.
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import {
  THEME_NAMES,
  THEME_VARIABLES,
  contrastRatio,
  createTheme,
  loadTheme,
  parseColor,
  type Rgba,
} from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { er } from '../plugin.ts';

const { theme: table }: Pick<DiagramPlugin, 'id' | 'theme'> = er;
const OWN = [
  'rowOdd',
  'rowEven',
  'erEdgeLabelBackground',
  'erEdgeLabelColor',
  'erMarkerFill',
  'erZeroOrMoreCircleOffset',
  'erRowOddTextColor',
  'erRowEvenTextColor',
];
const CLASSIC = ['default', 'dark', 'forest', 'neutral', 'base'];

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

  it('fills edge labels with the theme background in every theme (D628)', async () => {
    for (const name of [...CLASSIC, 'redux', 'redux-color', 'redux-dark', 'redux-dark-color']) {
      const t = await themed(name);
      expect(t.value('erEdgeLabelBackground'), name).toBe(t.value('background'));
    }
  });

  it('lets the author set the edge label fill, by its own variable or the shared one', async () => {
    for (const name of [...CLASSIC, 'redux', 'redux-color', 'neo-dark']) {
      const own = await themed(name, { erEdgeLabelBackground: '#123456' });
      expect(own.value('erEdgeLabelBackground'), name).toBe('#123456');
      const shared = await themed(name, { edgeLabelBackground: '#abcdef' });
      expect(shared.value('erEdgeLabelBackground'), name).toBe('#abcdef');
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

  it('inks attribute text against its own row, the header against the entity (#758)', async () => {
    const t = await themed('base', { primaryColor: '#335577' });
    const rgba = (name: string) => t.rgba(name) as Rgba;
    // The header ink is base's light background, which misses AA on the lightened odd row.
    expect(t.value('nodeTextColor')).toBe('#f4f4f4');
    expect(contrastRatio(rgba('nodeTextColor'), rgba('rowOdd'))).toBeLessThan(4.5);
    for (const [ink, row] of [
      ['erRowOddTextColor', 'rowOdd'],
      ['erRowEvenTextColor', 'rowEven'],
    ] as const)
      expect(contrastRatio(rgba(ink), rgba(row)), ink).toBeGreaterThanOrEqual(4.5);
  });

  it('picks the row ink live over the row fill in CSS, so a host primaryColor reaches it (#758)', async () => {
    for (const name of CLASSIC) {
      const t = createTheme(await loadTheme(name as 'default'), { diagram: table });
      t.color('erRowOddTextColor');
      t.color('erRowEvenTextColor');
      const root = t.rootStyle();
      expect(root['--_eot'], name).toContain('var(--_ro)');
      expect(root['--_eet'], name).toContain('var(--_re)');
    }
  });

  it("keeps an author's nodeTextColor on the rows where it reads", async () => {
    for (const name of CLASSIC) {
      const t = await themed(name, { nodeTextColor: name === 'dark' ? '#ffcc00' : '#002200' });
      expect([t.value('erRowOddTextColor'), t.value('erRowEvenTextColor')], name).toEqual([
        t.value('nodeTextColor'),
        t.value('nodeTextColor'),
      ]);
    }
  });

  it('fills the ER tag with edgeLabelBackground and inks it with textColor (#1347, D713, D715)', async () => {
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
      expect([t.value('erEdgeLabelColor'), t.value('erEdgeLabelBackground')], name).toEqual(
        TAG[name]
      );
      expect(TAG[name], name).toEqual([t.value('textColor'), t.value('edgeLabelBackground')]);
    }
  });

  it('follows edgeLabelBackground, and erEdgeLabelBackground for ER alone (D715)', async () => {
    const shared = await themed('default', { edgeLabelBackground: '#ffe0a0' });
    expect(shared.value('erEdgeLabelBackground')).toBe('#ffe0a0');
    const own = await themed('default', { erEdgeLabelBackground: '#a0e0ff' });
    expect([own.value('erEdgeLabelBackground'), own.value('edgeLabelBackground')]).toEqual([
      '#a0e0ff',
      '#ffffff',
    ]);
  });

  it('keeps the tag ink readable on a light tag under a dark theme (D713)', async () => {
    for (const vars of [{ background: '#fafafa' }, { edgeLabelBackground: '#fafafa' }]) {
      const t = await themed('dark', vars);
      const ink = parseColor(t.value('erEdgeLabelColor'))!;
      const fill = parseColor(t.value('erEdgeLabelBackground'))!;
      expect(contrastRatio(ink, fill), JSON.stringify(vars)).toBeGreaterThanOrEqual(4.5);
    }
    // An author's own ink wins as written.
    const own = await themed('dark', { erEdgeLabelColor: '#123456' });
    expect(own.value('erEdgeLabelColor')).toBe('#123456');
  });
});
