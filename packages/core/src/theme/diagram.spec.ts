import { describe, expect, it } from 'vitest';
import {
  createTheme,
  loadTheme,
  THEME_NAMES,
  type DiagramThemeTable,
  type ThemeFamily,
  type ThemeSpec,
  type ThemeWarning,
} from './index.ts';

/**
 * The diagram theme table (D331, spec #414 T0a): a diagram's own variables, keyed by theme traits,
 * merged at today's layers, with nested sections (D335, D540) and the cache key of D336.
 */
const spec = Object.fromEntries(
  await Promise.all(THEME_NAMES.map(async (n) => [n, await loadTheme(n)] as const))
) as Record<(typeof THEME_NAMES)[number], ThemeSpec>;

const TABLE: DiagramThemeTable = {
  section: 'demo',
  vars: {
    demoFill: { alias: 'dmf', kind: 'color', nested: 'fill' },
    demoText: { alias: 'dmt', kind: 'color', nested: 'text' },
    demoGap: { alias: 'dmg', kind: 'length', nested: 'gap' },
    demoPad: { alias: 'dmp', kind: 'padding' },
    demoOn: { alias: 'dmo', kind: 'flag' },
  },
  rules: {
    light: { demoFill: 'mainBkg', demoText: 'primaryTextColor' },
    dark: { demoFill: 'mix(mainBkg, black, 20%)' },
  },
  families: {
    classic: { tokens: { demoGap: 4, demoPad: 'padding', demoOn: false } },
    redux: {
      rules: { demoText: 'lineColor' },
      tokens: { demoGap: 8, demoPad: 12, demoOn: true },
      dark: { values: { demoText: '#eeeeee' } },
    },
    // neo takes redux's entries beneath its own, and its own gap (D331).
    neo: { fallback: 'redux', tokens: { demoGap: 6 } },
  },
};

const lit = (s: ThemeSpec, opts: Parameters<typeof createTheme>[1] = {}) =>
  createTheme(s, { cssVariables: false, diagram: TABLE, ...opts });

describe('theme traits (D331)', () => {
  it('gives every built-in theme its family', () => {
    const families: Record<ThemeFamily, string[]> = { classic: [], redux: [], neo: [] };
    for (const n of THEME_NAMES) families[spec[n].family].push(n);
    expect(families).toEqual({
      classic: ['default', 'dark', 'forest', 'neutral', 'base'],
      redux: ['redux-color', 'redux', 'redux-dark', 'redux-dark-color'],
      neo: ['neo', 'neo-dark'],
    });
  });
});

describe('DiagramThemeTable (D331, spec #414 T0a)', () => {
  it('defines the table vars for the render only', () => {
    expect(() => createTheme(spec.base).color('demoFill')).toThrow(/Unknown theme variable/);
    expect(createTheme(spec.base, { diagram: TABLE }).color('demoFill')).toBe('var(--_dmf)');
  });

  it('derives with its light rules over the shared vocabulary', () => {
    const t = createTheme(spec.base, { diagram: TABLE });
    t.color('demoFill');
    expect(t.rootStyle()).toEqual({
      '--_dmf': 'var(--mermaid-demoFill,var(--_mb))',
      '--_mb': 'var(--mermaid-mainBkg,var(--_p))',
      '--_p': 'var(--mermaid-primaryColor,#fff4dd)',
    });
  });

  it('takes its dark rules under a dark theme and under darkMode', () => {
    const dark = createTheme(spec.dark, { diagram: TABLE });
    dark.color('demoFill');
    expect(dark.rootStyle()['--_dmf']).toBe(
      'var(--mermaid-demoFill,color-mix(in srgb,var(--_mb) 80%,black))'
    );
    const viaDark = createTheme(spec.base, { diagram: TABLE, themeVariables: { darkMode: true } });
    viaDark.color('demoFill');
    expect(viaDark.rootStyle()['--_dmf']).toBe(
      'var(--mermaid-demoFill,color-mix(in srgb,var(--_mb) 80%,black))'
    );
  });

  it('keys entries by family, never by theme name', () => {
    expect(lit(spec.default).number('demoGap')).toBe(4);
    expect(lit(spec.forest).number('demoGap')).toBe(4);
    expect(lit(spec.redux).number('demoGap')).toBe(8);
    expect(lit(spec['redux-color']).number('demoGap')).toBe(8);
    expect(lit(spec.neo).number('demoGap')).toBe(6);
    expect(lit(spec.neo).padding('demoPad', 99)).toBe(12);
    expect(lit(spec.base).padding('demoPad', 99)).toBe(99);
    expect(lit(spec.redux).value('demoOn')).toBe('true');
    expect(lit(spec.base).value('demoOn')).toBe('false');
  });

  it("applies a family's rules over the table's, and its dark entries in its dark themes", () => {
    expect(lit(spec.redux).value('demoText')).toBe(lit(spec.redux).value('lineColor'));
    expect(lit(spec.base).value('demoText')).toBe(lit(spec.base).value('primaryTextColor'));
    expect(lit(spec['redux-dark']).value('demoText')).toBe('#eeeeee');
    // The fallback's dark entries apply beneath the family's own.
    expect(lit(spec['neo-dark']).value('demoText')).toBe('#eeeeee');
    // The trait, not the author's darkMode, picks a family's dark entries.
    expect(lit(spec.redux, { themeVariables: { darkMode: true } }).value('demoText')).toBe(
      lit(spec.redux).value('lineColor')
    );
  });

  it('gives a family with no entries only the table rules', () => {
    const t = createTheme(spec.neo, {
      cssVariables: false,
      diagram: { ...TABLE, families: { redux: TABLE.families!.redux! } },
    });
    expect(t.value('demoText')).toBe(t.value('primaryTextColor'));
  });

  it('lets family values beat every rule, and author overrides beat them', () => {
    const t = lit(spec['redux-dark'], { rules: { demoText: 'red' } });
    expect(t.value('demoText')).toBe('#eeeeee');
    expect(
      lit(spec['redux-dark'], { themeVariables: { demoText: '#123456' } }).value('demoText')
    ).toBe('#123456');
  });

  it("puts the theme spec's own rules beneath the family's", () => {
    const withRules: ThemeSpec = { ...spec.redux, rules: { ...spec.redux.rules, demoText: 'red' } };
    expect(lit(withRules).value('demoText')).toBe(lit(spec.redux).value('lineColor'));
    const classic: ThemeSpec = { ...spec.base, rules: { demoText: 'red' } };
    expect(lit(classic).value('demoText')).toBe('red');
  });

  it('beats a plugin fragment rule of the same name, and keeps its own kind (D337)', () => {
    const t = lit(spec.base, { rules: { demoFill: 'red', pluginFill: 'blue' } });
    expect(t.value('demoFill')).toBe(t.value('mainBkg'));
    expect(t.value('pluginFill')).toBe('blue');
    expect(lit(spec.base, { rules: { demoGap: 'red' } }).number('demoGap')).toBe(4);
  });

  it('never redefines a core variable', () => {
    const t = createTheme(spec.base, {
      cssVariables: false,
      diagram: { vars: { mainBkg: { alias: 'zz', kind: 'length' } }, rules: { light: {} } },
    });
    expect(t.color('mainBkg')).toBe('#fff4dd');
  });
});

describe('nested theme sections (D335, D540)', () => {
  it('maps themeVariables.<section>.<key> onto the flat variable, key by key', () => {
    const t = lit(spec.base, { themeVariables: { demo: { fill: '#112233', gap: 9 } } });
    expect(t.value('demoFill')).toBe('#112233');
    expect(t.number('demoGap')).toBe(9);
    const css = createTheme(spec.base, {
      diagram: TABLE,
      themeVariables: { demo: { fill: '#112233' } },
    });
    css.color('demoFill');
    expect(css.rootStyle()['--_dmf']).toBe('var(--mermaid-demoFill,#112233)');
  });

  it('lets the flat name win, with no warning', () => {
    const warnings: ThemeWarning[] = [];
    const t = lit(spec.base, {
      themeVariables: { demoFill: '#445566', demo: { fill: '#112233' } },
      warn: (w) => warnings.push(w),
    });
    expect(t.value('demoFill')).toBe('#445566');
    expect(warnings).toEqual([]);
  });

  it('ignores unknown nested keys and keys with no mapping, and drops bad values', () => {
    const warnings: ThemeWarning[] = [];
    const t = lit(spec.base, {
      themeVariables: { demo: { nope: '#000000', pad: 3, text: 'url(x)' } },
      warn: (w) => warnings.push(w),
    });
    expect(t.padding('demoPad', 7)).toBe(7);
    expect(t.value('demoText')).toBe(t.value('primaryTextColor'));
    expect(warnings.map((w) => w.code)).toEqual(['THEME_VARIABLE_DROPPED']);
  });

  it('reads no section for a table without one, or with no table', () => {
    const t = createTheme(spec.base, {
      cssVariables: false,
      diagram: { ...TABLE, section: undefined },
      themeVariables: { demo: { fill: '#112233' } },
    });
    expect(t.value('demoFill')).toBe(t.value('mainBkg'));
    expect(() =>
      createTheme(spec.base, { themeVariables: { demo: { fill: '#112233' } } })
    ).not.toThrow();
  });
});

describe('the theme cache (D336)', () => {
  it('reuses resolution for the same spec, table and fragment rules', () => {
    const rules = { pluginFill: 'blue' };
    const a = createTheme(spec.base, { diagram: TABLE, rules });
    a.color('demoFill');
    const b = createTheme(spec.base, { diagram: TABLE, rules });
    b.color('demoFill');
    // The root style text is cached by the aliases used, so a shared resolver returns the same.
    expect(b.rootStyleText()).toBe(a.rootStyleText());
  });

  it('keeps tables apart', () => {
    const other: DiagramThemeTable = { ...TABLE, rules: { light: { demoFill: 'lineColor' } } };
    const a = lit(spec.base);
    const b = lit(spec.base, { diagram: other });
    expect(a.value('demoFill')).toBe(a.value('mainBkg'));
    expect(b.value('demoFill')).toBe(b.value('lineColor'));
  });

  it('keeps fragment tables apart', () => {
    expect(lit(spec.base, { rules: { pluginFill: 'blue' } }).value('pluginFill')).toBe('blue');
    expect(lit(spec.base, { rules: { pluginFill: 'red' } }).value('pluginFill')).toBe('red');
  });
});

describe('rule DSL: palette reads and literal() (D332)', () => {
  const table = (rules: Record<string, string>): DiagramThemeTable => ({
    vars: Object.fromEntries(
      Object.keys(rules).map((n, i) => [n, { alias: `x${i}`, kind: 'color' as const }])
    ),
    rules: { light: rules },
  });

  it('reads bkgColorArray and borderColorArray slots as literal colours', () => {
    const t = createTheme(spec['redux-color'], {
      diagram: table({ a: 'bkgColorArray1', b: 'darken(borderColorArray0, 10%)' }),
    });
    t.color('a');
    t.color('b');
    expect(t.rootStyle()).toEqual({
      '--_x0': `var(--mermaid-a,${t.palette('bkgColorArray')[1]})`,
      '--_x1': `var(--mermaid-b,color-mix(in srgb,${t.palette('borderColorArray')[0]} 90%,black))`,
    });
  });

  it("follows the author's palette overrides", () => {
    const t = createTheme(spec['redux-color'], {
      cssVariables: false,
      diagram: table({ a: 'bkgColorArray1' }),
      themeVariables: { bkgColorArray: ['#000001', '#000002'] },
    });
    expect(t.value('a')).toBe('#000002');
  });

  it('reads past the end of a palette as currentColor', () => {
    const t = createTheme(spec['redux-dark-color'], {
      cssVariables: false,
      diagram: table({ a: 'bkgColorArray0' }),
    });
    expect(t.value('a')).toBe('currentColor');
  });

  it('reads a seriesColorArray entry as the theme wrote it', () => {
    const s: ThemeSpec = {
      ...spec.base,
      palettes: { ...spec.base.palettes, seriesColorArray: ['darkenHsl(secondaryColor, 30%)'] },
    };
    const t = createTheme(s, { diagram: table({ a: 'seriesColorArray0' }) });
    t.color('a');
    expect(t.rootStyle()['--_x0']).toBe(
      'var(--mermaid-a,hsl(from var(--_s) h s clamp(0, l - 30, 100) / alpha))'
    );
    expect(t.rootStyle()['--_s']).toBeDefined();
    const user = createTheme(s, {
      cssVariables: false,
      diagram: table({ a: 'seriesColorArray0' }),
      themeVariables: { seriesColorArray: ['#abcdef'] },
    });
    expect(user.value('a')).toBe('#abcdef');
  });

  it("reads the dark spec's seriesColorArray under theme: 'auto'", () => {
    const night: ThemeSpec = {
      ...spec.dark,
      palettes: { ...spec.dark.palettes, seriesColorArray: ['#123456', 'textColor'] },
    };
    const t = createTheme(spec['redux-color'], {
      dark: night,
      diagram: table({ a: 'seriesColorArray0', b: 'seriesColorArray1' }),
    });
    t.color('a');
    t.color('b');
    const dark = t.autoDeclarations()!.dark;
    expect(dark['--_x0']).toBe('var(--mermaid-a,#123456)');
    expect(dark['--_x1']).toBe('var(--mermaid-b,var(--_tx))');
  });

  it('writes literal(x) as the computed colour, with no dependencies', () => {
    const t = createTheme(spec.base, {
      diagram: table({
        a: 'literal(adjustHue(primaryColor, 64))',
        b: 'adjustHue(primaryColor, 64)',
      }),
    });
    t.color('a');
    const computed = createTheme(spec.base, {
      cssVariables: false,
      diagram: table({ b: 'adjustHue(primaryColor, 64)' }),
    }).value('b');
    expect(t.rootStyle()).toEqual({ '--_x0': `var(--mermaid-a,${computed})` });
    expect(computed).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('shared label ink (D334)', () => {
  it('derives cScaleLabel from scaleLabelColor, not from a sequence variable', () => {
    // v12 default ignores scaleLabelColor for its labels; theme-palettes.spec.ts checks parity.
    for (const n of ['redux-color', 'base', 'neo', 'forest', 'dark', 'neutral'] as const) {
      const t = createTheme(spec[n], {
        cssVariables: false,
        themeVariables: { scaleLabelColor: '#123456' },
      });
      expect(t.palette('cScaleLabel'), n).toContain('#123456');
      const seq = createTheme(spec[n], {
        cssVariables: false,
        themeVariables: { labelTextColor: '#123456', actorTextColor: '#123456' },
      });
      expect(seq.palette('cScaleLabel'), n).not.toContain('#123456');
    }
  });
});
