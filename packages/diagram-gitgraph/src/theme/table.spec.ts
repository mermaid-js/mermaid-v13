/**
 * gitGraph's own theme variables (spec #414 T1b, D331): its label colours, inks and geometry live
 * in the plugin's table, keyed by family, and resolve through `createTheme` as in v12.
 */
import { THEME_VARIABLES, createTheme, loadTheme, type ThemeName } from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { gitGraph } from '../plugin.ts';
import { THEME_VARIABLES as OWN } from './vocabulary.ts';

const table = gitGraph.theme;
const themed = async (name: ThemeName, themeVariables?: Record<string, unknown>) =>
  createTheme(await loadTheme(name), { diagram: table, themeVariables });

describe('the gitGraph theme table (#414 T1b)', () => {
  it('owns its variables; core keeps only the git palettes mindmap reads too', () => {
    expect(Object.keys(table.vars).sort()).toEqual(Object.keys(OWN).sort());
    for (const name of Object.keys(OWN)) expect(THEME_VARIABLES[name], name).toBeUndefined();
  });

  it('writes each theme’s label shape through the badge and callout inputs (D332)', async () => {
    // default pins v12's constructor literals; base derives from its base colours.
    const def = await themed('default');
    expect(def.value('commitLabelColor')).toBe('#000021');
    expect(def.value('tagLabelBackground')).toBe('#ececff');
    const decl = async (name: ThemeName, v: string) => {
      const t = await themed(name);
      t.color(v);
      return t.rootStyle()['--_gtk' as keyof ReturnType<typeof t.rootStyle>];
    };
    expect(await decl('default', 'tagLabelBackground')).toBe(
      'var(--mermaid-tagLabelBackground,#ececff)'
    );
    expect(await decl('base', 'tagLabelBackground')).toBe(
      'var(--mermaid-tagLabelBackground,var(--_p))'
    );
  });

  it('lets an author’s tagBorder fill tagLabelBorder, and tagLabelBorder win over it', async () => {
    expect((await themed('forest', { tagBorder: '#123456' })).value('tagLabelBorder')).toBe(
      '#123456'
    );
    const both = await themed('forest', { tagBorder: '#123456', tagLabelBorder: '#654321' });
    expect(both.value('tagLabelBorder')).toBe('#654321');
  });

  it('takes the inks and geometry from the family and the dark trait', async () => {
    const ink = async (n: ThemeName) => (await themed(n)).value('gitCherryPickInk');
    expect(await ink('redux')).toBe('#ffffff');
    expect(await ink('redux-dark')).toBe('#000000');
    expect(await ink('dark')).toBe('#000000');
    expect(await ink('neo-dark')).toBe('#000000');
    expect(await ink('default')).toBe('currentColor');
    expect((await themed('neo')).value('gitNodeColors')).toBe('true');
    expect((await themed('neo')).number('gitCommitRadius')).toBe(10);
    expect((await themed('redux-color')).number('gitCommitRadius')).toBe(7);
  });
});
