import { describe, expect, it } from 'vitest';
import {
  createTheme,
  loadTheme,
  THEME_NAMES,
  type DiagramThemeTable,
  type ThemeFamily,
  type ThemeOptions,
  type ThemeSpec,
  type ThemeWarning,
} from './index.ts';
import { parseRule } from './dsl.ts';

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

  it("keeps a fragment's rule for a core name the table shadows (D337)", () => {
    // The table's mainBkg is ignored (a core name), so it does not take the fragment's rule away.
    const rules = { mainBkg: 'red' };
    const plain = createTheme(spec.base, { cssVariables: false, rules });
    const shadowed = createTheme(spec.base, {
      cssVariables: false,
      rules,
      diagram: { vars: { mainBkg: { alias: 'zz', kind: 'color' } }, rules: { light: {} } },
    });
    expect(plain.value('mainBkg')).toBe('red');
    expect(shadowed.value('mainBkg')).toBe('red');
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

  it('derives a series slot the theme leaves out from its base colours (v12 theme-base)', () => {
    // A theme with no series entries: v12 theme-base's pie and journey derivation, the seed
    // pair being the primary and secondary colours.
    const { palettes: _, ...bare } = spec.base;
    const read = (s: ThemeSpec, slot: number, themeVariables?: Record<string, unknown>) =>
      createTheme(s, {
        cssVariables: false,
        diagram: table({ a: `seriesColorArray${slot}` }),
        themeVariables,
      }).value('a');
    const at = (rule: string) =>
      createTheme(bare, { cssVariables: false, diagram: table({ a: rule }) }).value('a');
    expect(read(bare, 0)).toBe(at('primaryColor'));
    expect(read(bare, 1)).toBe(at('secondaryColor'));
    expect(read(bare, 5)).toBe(at('darkenHsl(tertiaryColor, 10%)'));
    expect(read(bare, 6)).toBe(at('darkenHsl(adjustHue(primaryColor, 60), 10%)'));
    expect(read(bare, 11)).toBe(at('darkenHsl(adjustHue(primaryColor, 120), 10%)'));
    expect(read(bare, 12)).toBe(at('primaryColor'));
    expect(read(bare, 19)).toBe(at('adjustHue(secondaryColor, 128)'));
    // It follows the base colours, and the theme's own entry wins where there is one.
    expect(read(bare, 0, { primaryColor: '#123456' })).toBe('#123456');
    const one: ThemeSpec = { ...bare, palettes: { seriesColorArray: ['#abcdef'] } };
    expect([read(one, 0), read(one, 1)]).toEqual(['#abcdef', at('secondaryColor')]);
    // Past the twenty slots: currentColor.
    expect(read(bare, 20)).toBe('currentColor');
    const css = createTheme(bare, { diagram: table({ a: 'seriesColorArray1' }) });
    css.color('a');
    expect(css.rootStyle()['--_x0']).toBe('var(--mermaid-a,var(--_s))');
  });

  it('derives the scale and git palettes a theme leaves out from its base colours (v12 theme-base)', () => {
    const { palettes: _, darkModePalettes: __, ...bare } = spec.base;
    const read = (s: ThemeSpec, slot: string, themeVariables?: Record<string, unknown>) =>
      createTheme(s, { cssVariables: false, diagram: table({ a: slot }), themeVariables }).value(
        'a'
      );
    const at = (rule: string) => read(bare, rule);
    const dark = { darkMode: true };
    // Hue steps darkened by 25, 75 under darkMode; slot 8 lightened first. Its own base colours.
    expect(read(bare, 'cScale0')).toBe(at('darkenHsl(primaryColor, 25%)'));
    expect(read(bare, 'cScale1')).toBe(at('darkenHsl(secondaryColor, 25%)'));
    expect(read(bare, 'cScale2')).toBe(at('darkenHsl(tertiaryColor, 25%)'));
    expect(read(bare, 'cScale3')).toBe(at('darkenHsl(adjustHue(primaryColor, 30), 25%)'));
    expect(read(bare, 'cScale8')).toBe(
      at('darkenHsl(lightenHsl(adjustHue(primaryColor, 210), 100%), 25%)')
    );
    expect(read(bare, 'cScale0', dark)).toBe(at('darkenHsl(primaryColor, 75%)'));
    expect(read(bare, 'cScaleInv0')).toBe(at('invert(darkenHsl(primaryColor, 25%))'));
    expect(read(bare, 'cScaleLabel0')).toBe(at('scaleLabelColor'));
    // git darkened by 25, lightened under darkMode with black branch labels.
    expect(read(bare, 'git3')).toBe(at('darkenHsl(adjustHue(primaryColor, -30), 25%)'));
    expect(read(bare, 'git0', dark)).toBe(at('lightenHsl(primaryColor, 25%)'));
    expect(read(bare, 'gitBranchLabel0', dark)).toBe('black');
    // An author's slot is drawn as given, its inverse derived from it as v12 does.
    const own = { cScale3: '#123456' };
    expect(read(bare, 'cScale3', own)).toBe('#123456');
    expect(read(bare, 'cScaleInv3', own)).toBe(at('invert(darkenHsl(#123456, 25%))'));
    // A theme that writes cScale but no inverse inverts its own slots.
    const one: ThemeSpec = { ...bare, palettes: { cScale: ['#abcdef'] } };
    expect([read(one, 'cScale0'), read(one, 'cScaleInv0')]).toEqual(['#abcdef', '#543210']);
    expect(createTheme(one).palette('cScale')).toEqual(['#abcdef']);
    expect(createTheme(bare).palette('git')).toHaveLength(8);
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

  it('writes inline(v) as the theme wrote v, with no alias of its own', () => {
    const derived = createTheme(spec.base, { diagram: table({ a: 'inline(mainBkg)' }) });
    derived.color('a');
    expect(derived.rootStyle()).toEqual({
      '--_x0': 'var(--mermaid-a,var(--_p))',
      '--_p': 'var(--mermaid-primaryColor,#fff4dd)',
    });
    const pinned: ThemeSpec = { ...spec.base, values: { ...spec.base.values, mainBkg: '#f4f4f4' } };
    const asPinned = createTheme(pinned, { diagram: table({ a: 'inline(mainBkg)' }) });
    asPinned.color('a');
    expect(asPinned.rootStyle()).toEqual({ '--_x0': 'var(--mermaid-a,#f4f4f4)' });
    expect(() =>
      createTheme(spec.base, { cssVariables: false, diagram: table({ a: 'inline(red)' }) }).value(
        'a'
      )
    ).toThrow(/inline needs a variable/);
  });

  it("reads inline(v) as the theme wrote v, not the author's override of v", () => {
    const of = (themeVariables: Record<string, string>) => {
      const t = createTheme(spec.base, {
        diagram: table({ a: 'inline(mainBkg)' }),
        themeVariables,
      });
      t.color('a');
      return t.rootStyle()['--_x0'];
    };
    // The author's mainBkg does not reach a; the rule's own references follow their overrides.
    expect(of({ mainBkg: '#123456' })).toBe('var(--mermaid-a,var(--_p))');
    const t = createTheme(spec.base, {
      cssVariables: false,
      diagram: table({ a: 'inline(mainBkg)' }),
      themeVariables: { mainBkg: '#123456', primaryColor: '#abcdef' },
    });
    expect(t.value('a')).toBe('#abcdef');
    // An override of the diagram's own variable still wins.
    const own = createTheme(spec.base, {
      cssVariables: false,
      diagram: table({ a: 'inline(mainBkg)' }),
      themeVariables: { mainBkg: '#123456', a: '#654321' },
    });
    expect(own.value('a')).toBe('#654321');
  });

  it('writes inline(v, b) as v when the theme wrote v, else as b', () => {
    const rule = { a: 'inline(edgeLabelBackground, lineColor)' };
    const decl = (s: ThemeSpec, options: ThemeOptions = {}) => {
      const t = createTheme(s, { ...options, diagram: table(rule) });
      t.color('a');
      return t.rootStyle()['--_x0'];
    };
    // base leaves it to the shared rule (secondaryColor), which does not count as set.
    expect(decl(spec.base)).toBe('var(--mermaid-a,var(--_l))');
    const values: ThemeSpec = { ...spec.base, values: { edgeLabelBackground: '#eeeeee' } };
    expect(decl(values)).toBe('var(--mermaid-a,#eeeeee)');
    const rules: ThemeSpec = { ...spec.base, rules: { edgeLabelBackground: 'tertiaryColor' } };
    expect(decl(rules)).toBe('var(--mermaid-a,var(--_t))');
    // The author's override of v is not the theme writing it.
    const user = decl(spec.base, { themeVariables: { edgeLabelBackground: '#123456' } });
    expect(user).toBe('var(--mermaid-a,var(--_l))');
    // A family entry of the diagram's own table counts too (base is classic).
    const own: DiagramThemeTable = {
      vars: { a: { alias: 'x0', kind: 'color' }, b: { alias: 'x1', kind: 'color' } },
      rules: { light: { a: 'inline(b, lineColor)' } },
      families: { classic: { values: { b: '#abcdef' } }, redux: { rules: { b: 'mainBkg' } } },
    };
    const of = (s: ThemeSpec) => {
      const t = createTheme(s, { diagram: own });
      t.color('a');
      return t.rootStyle()['--_x0'];
    };
    expect(of(spec.base)).toBe('var(--mermaid-a,#abcdef)');
    expect(of(spec.redux)).toBe('var(--mermaid-a,var(--_mb))');
    expect(() => parseRule('inline(a, b, c)')).toThrow(/inline takes 1 arguments/);
    expect(() => parseRule('literal(a, b)')).toThrow(/literal takes 1 arguments/);
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

describe("a table's palette variable (D545)", () => {
  // A diagram's own list of colours: its rule names the shared palette it reads, a family may
  // name another, and the author replaces it by its flat name or its nested key.
  const PALETTE: DiagramThemeTable = {
    section: 'demo',
    vars: { demoSeries: { alias: 'dms', kind: 'palette', nested: 'series' } },
    rules: { light: { demoSeries: 'plotColorArray' } },
    families: { neo: { rules: { demoSeries: 'cScale' } } },
  };
  const read = (s: ThemeSpec, opts: ThemeOptions = {}) =>
    createTheme(s, { cssVariables: false, diagram: PALETTE, ...opts });
  const BASE_TEN = [
    '#FFF4DD',
    '#FFD8B1',
    '#FFA07A',
    '#ECEFF1',
    '#D6DBDF',
    '#C3E0A8',
    '#FFB6A4',
    '#FFD74D',
    '#738FA7',
    '#FFFFF0',
  ];

  it('reads the shared palette its rule names, and a family may name another', () => {
    for (const n of THEME_NAMES) {
      const shared = spec[n].family === 'neo' ? 'cScale' : 'plotColorArray';
      expect(read(spec[n]).palette('demoSeries'), n).toEqual(createTheme(spec[n]).palette(shared));
    }
    expect(read(spec.base).palette('demoSeries')).toEqual(BASE_TEN);
  });

  it("follows the author's list of the shared palette", () => {
    const t = read(spec.base, { themeVariables: { plotColorArray: '#111111, #222222' } });
    expect(t.palette('demoSeries')).toEqual(['#111111', '#222222']);
  });

  it("takes the author's list, flat or nested, as an array or a comma-separated string", () => {
    const flat = read(spec.base, { themeVariables: { demoSeries: ['#111111', '#222222'] } });
    expect(flat.palette('demoSeries')).toEqual(['#111111', '#222222']);
    const nested = read(spec.base, { themeVariables: { demo: { series: '#333333,#444444' } } });
    expect(nested.palette('demoSeries')).toEqual(['#333333', '#444444']);
    // The flat name wins, with no warning (D540); the shared palette keeps the theme's.
    const warnings: ThemeWarning[] = [];
    const both = read(spec.base, {
      themeVariables: { demoSeries: '#555555', demo: { series: '#666666' } },
      warn: (w) => warnings.push(w),
    });
    expect([both.palette('demoSeries'), warnings]).toEqual([['#555555'], []]);
    expect(both.palette('plotColorArray')).toEqual(BASE_TEN);
  });

  it("drops an unsafe list with a warning, and keeps the theme's", () => {
    const warnings: ThemeWarning[] = [];
    const t = read(spec.base, {
      themeVariables: { demo: { series: '#111111, url(x)' } },
      warn: (w) => warnings.push(w),
    });
    expect(t.palette('demoSeries')).toEqual(BASE_TEN);
    expect(warnings.map((w) => w.message)).toEqual([
      'themeVariables.demoSeries value "#111111, url(x)" is not allowed and was dropped.',
    ]);
  });

  it('takes an empty list as unset, as an empty value is, with no warning', () => {
    const warnings: ThemeWarning[] = [];
    const warn = (w: ThemeWarning) => warnings.push(w);
    for (const themeVariables of [
      { demoSeries: [] },
      { demoSeries: '' },
      { demo: { series: '' } },
      { plotColorArray: [] },
      { plotColorArray: '' },
    ]) {
      const t = read(spec.base, { themeVariables, warn });
      expect(t.palette('demoSeries'), JSON.stringify(themeVariables)).toEqual(BASE_TEN);
      expect(t.palette('plotColorArray')).toEqual(BASE_TEN);
    }
    expect(warnings).toEqual([]);
    // Other palettes keep an empty list: an empty bkgColorArray means border-only colour.
    const bands = createTheme(spec['redux-color'], { themeVariables: { bkgColorArray: [] } });
    expect(bands.palette('bkgColorArray')).toEqual([]);
  });

  it('writes its value comma-separated, and has no CSS variable', () => {
    expect(read(spec.base).value('demoSeries')).toBe(BASE_TEN.join(','));
    const css = createTheme(spec.base, { diagram: PALETTE });
    expect(css.palette('demoSeries')).toEqual(BASE_TEN);
    expect(() => css.color('demoSeries')).toThrow(TypeError);
    expect(css.rootStyle()).toEqual({});
  });

  it("reads v12 theme-base's ten chart colours where a theme leaves plotColorArray out", () => {
    const { palettes: _, ...bare } = spec.base;
    expect(createTheme(bare).palette('plotColorArray')).toEqual(BASE_TEN);
    expect(read(bare).palette('demoSeries')).toEqual(BASE_TEN);
    const own: ThemeSpec = { ...bare, palettes: { plotColorArray: ['#abcdef'] } };
    expect(createTheme(own).palette('plotColorArray')).toEqual(['#abcdef']);
  });
});
