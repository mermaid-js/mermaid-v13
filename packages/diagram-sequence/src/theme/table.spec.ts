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
const OWN = [
  'actorTextColor',
  'actorLineColor',
  'signalColor',
  'signalTextColor',
  'labelBoxBkgColor',
  'labelBoxBorderColor',
  'labelTextColor',
  'loopTextColor',
  'activationBkgColor',
  'activationBorderColor',
  'sequenceNumberColor',
];
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

  it('reads the participant fill and border from core, which usecase reads too (#561, D474)', async () => {
    for (const name of ['actorBkg', 'actorBorder'])
      expect(THEME_VARIABLES[name]?.usedBy, name).toEqual(['sequence', 'usecase']);
    const t = createTheme(await loadTheme('default'), { cssVariables: false, diagram: table });
    expect(t.value('actorBkg')).toBe(t.value('mainBkg'));
    expect(t.value('labelBoxBkgColor')).toBe(t.value('actorBkg'));
    expect(t.value('actorLineColor')).toBe(t.value('actorBorder'));
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
    expect(t.value('actorTextColor')).toBe('#654321');
    expect([t.value('labelTextColor'), t.value('loopTextColor')]).toEqual(['#654321', '#654321']);
  });

  it("reads each theme's shared inputs in the theme's own shape (D332, inline)", async () => {
    const decl = async (name: string, v: string) => {
      const t = createTheme(await loadTheme(name as 'default'), { diagram: table });
      t.color(v);
      return Object.values(t.rootStyle())[0];
    };
    // default pins v12's grey, base derives it from secondaryColor: both as v12 wrote them.
    expect(await decl('default', 'activationBkgColor')).toBe(
      'var(--mermaid-activationBkgColor,#f4f4f4)'
    );
    expect(await decl('base', 'activationBkgColor')).toBe(
      'var(--mermaid-activationBkgColor,var(--_s))'
    );
    expect(await decl('forest', 'signalColor')).toBe('var(--mermaid-signalColor,#333333)');
    expect(await decl('neutral', 'actorTextColor')).toBe('var(--mermaid-actorTextColor,#333333)');
    expect(await decl('dark', 'sequenceNumberColor')).toBe(
      'var(--mermaid-sequenceNumberColor,#000000)'
    );
    // The fragment tab reads the participant border unless the theme writes a frame border.
    expect(await decl('default', 'labelBoxBorderColor')).toBe(
      'var(--mermaid-labelBoxBorderColor,var(--_ar))'
    );
    expect(await decl('forest', 'labelBoxBorderColor')).toBe(
      'var(--mermaid-labelBoxBorderColor,#326932)'
    );
    expect(await decl('neo', 'actorBorder')).toBe('var(--mermaid-actorBorder,#b3b3b3)');
  });

  it('draws redux-dark messages white and their text in the text ink, as v12', async () => {
    for (const name of ['redux-dark', 'redux-dark-color']) {
      const t = createTheme(await loadTheme(name as 'default'), {
        diagram: table,
        cssVariables: false,
      });
      expect([t.value('signalColor'), t.value('signalTextColor')], name).toEqual([
        '#ffffff',
        t.value('textColor'),
      ]);
    }
    const neoDark = createTheme(await loadTheme('neo-dark'), {
      diagram: table,
      cssVariables: false,
    });
    expect(neoDark.value('signalColor')).toBe(neoDark.value('textColor'));
  });
});
