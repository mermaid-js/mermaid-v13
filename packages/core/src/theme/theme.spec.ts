import { describe, expect, it } from 'vitest';
import { assertInert, streamWriter, styleText } from '../svg/index.ts';
import {
  createTheme,
  loadTheme,
  type DiagramThemeTable,
  type ThemeName,
  type ThemeWarning,
} from './index.ts';

const base = await loadTheme('base');

describe('createTheme: CSS variables (R-THEME-2, -4)', () => {
  it('references base variables through an alias with the theme value as fallback', () => {
    const t = createTheme(base);
    expect(t.color('primaryColor')).toBe('var(--_p)');
    expect(t.rootStyle()).toEqual({ '--_p': 'var(--mermaid-primaryColor,#fff4dd)' });
  });

  it('derives in CSS from the base aliases, writing only the aliases used', () => {
    const t = createTheme(base);
    t.color('nodeBorder');
    expect(t.rootStyle()).toEqual({
      '--_nb': 'var(--mermaid-nodeBorder,var(--_pb))',
      '--_pb': 'var(--mermaid-primaryBorderColor,color-mix(in srgb,var(--_p) 85%,black))',
      '--_p': 'var(--mermaid-primaryColor,#fff4dd)',
    });
  });

  it('uses an explicit themeVariables value as the literal fallback; the CSS var still wins', () => {
    const t = createTheme(base, { themeVariables: { primaryBorderColor: '#ff0000' } });
    t.color('nodeBorder');
    expect(t.rootStyle()['--_pb']).toBe('var(--mermaid-primaryBorderColor,#ff0000)');
    expect(t.rootStyle()['--_p']).toBeUndefined();
  });

  it('re-derives from an overridden base variable', () => {
    const t = createTheme(base, {
      themeVariables: { primaryColor: '#ffffff' },
      cssVariables: false,
    });
    // color-mix(in srgb, #fff 85%, black) = rgb(216.75 …), written #d9d9d9
    expect(t.color('nodeBorder')).toBe('#d9d9d9');
    expect(t.color('mainBkg')).toBe('#ffffff');
  });

  it('drops unsafe theme variables with a warning and ignores unknown ones', () => {
    const warnings: ThemeWarning[] = [];
    const t = createTheme(base, {
      themeVariables: {
        primaryColor: 'url(javascript:alert(1))',
        lineColor: 'red;}svg{fill:red',
        notAThemeVariable: '#123456',
        fontFamily: 'x</style><script>',
      },
      cssVariables: false,
      warn: (w) => warnings.push(w),
    });
    expect(t.color('primaryColor')).toBe('#fff4dd');
    expect(t.color('lineColor')).toBe('#0b0b0b');
    expect(warnings.map((w) => w.code)).toEqual([
      'THEME_VARIABLE_DROPPED',
      'THEME_VARIABLE_DROPPED',
      'THEME_VARIABLE_DROPPED',
    ]);
  });

  it('accepts the colour functions on the allow-list, leaving them to CSS', () => {
    const t = createTheme(base, { themeVariables: { primaryColor: 'oklch(70% 0.1 200)' } });
    t.color('mainBkg');
    expect(t.rootStyle()['--_p']).toBe('var(--mermaid-primaryColor,oklch(70% 0.1 200))');
  });
});

describe('createTheme: base derives by rule (#797, v12 theme-base)', () => {
  const lit = (themeVariables?: Record<string, unknown>) =>
    createTheme(base, { cssVariables: false, themeVariables });

  it('keeps the stock values with no override', () => {
    const t = lit();
    expect(['secondaryColor', 'tertiaryColor', 'lineColor', 'arrowheadColor'].map(t.value)).toEqual(
      ['#f4ddff', '#f6f9ff', '#0b0b0b', '#0b0b0b']
    );
  });

  it('turns secondaryColor and tertiaryColor with primaryColor, as v12 adjust does', () => {
    // khroma: adjust('#3366cc', { h: -120 }) = hsl(100, 60%, 50%); { h: 180, l: 5 } = hsl(40, 60%, 55%).
    const t = lit({ primaryColor: '#3366cc' });
    expect(t.value('secondaryColor')).toBe('#66cc33');
    expect(t.value('tertiaryColor')).toBe('#d1a347');
    expect(t.value('clusterBkg')).toBe('#d1a347');
    // Edge labels sit on the background, whatever primaryColor is (D628).
    expect(t.value('edgeLabelBackground')).toBe(t.value('background'));
  });

  it('inverts background for lineColor and arrowheadColor', () => {
    const t = lit({ background: '#222222' });
    expect(t.value('lineColor')).toBe('#dddddd');
    expect(t.value('arrowheadColor')).toBe('#dddddd');
    expect(t.value('defaultLinkColor')).toBe('#dddddd');
  });

  it("keeps the author's value; arrowheads follow an author's lineColor, as v12's .marker (D575)", () => {
    const t = lit({ primaryColor: '#3366cc', secondaryColor: '#123456', lineColor: '#ff0000' });
    expect(t.value('secondaryColor')).toBe('#123456');
    expect(t.value('tertiaryColor')).toBe('#d1a347');
    expect(t.value('lineColor')).toBe('#ff0000');
    expect(t.value('arrowheadColor')).toBe('#ff0000');
  });

  it('draws errors in the tertiary colours, as v12 theme-base (#825)', () => {
    expect(['errorBkgColor', 'errorTextColor'].map(lit().value)).toEqual(['#f6f9ff', '#333333']);
    const t = lit({ primaryColor: '#3366cc', darkMode: true });
    expect(t.value('errorBkgColor')).toBe(t.value('tertiaryColor'));
    expect(t.value('errorTextColor')).toBe(t.value('tertiaryTextColor'));
    const own = lit({ tertiaryColor: '#123456', tertiaryTextColor: '#fedcba' });
    expect(['errorBkgColor', 'errorTextColor'].map(own.value)).toEqual(['#123456', '#fedcba']);
  });

  it("keeps v12's note colours, which neither darkMode nor primaryTextColor moves (#825)", () => {
    for (const themeVariables of [{ darkMode: true }, { primaryTextColor: '#2a4d69' }]) {
      const t = lit(themeVariables);
      expect(['noteBkgColor', 'noteTextColor'].map(t.value)).toEqual(['#fff5ad', '#333333']);
    }
  });

  it('writes the fallbacks as CSS over the primaryColor and background aliases (R-THEME-4)', () => {
    const t = createTheme(base);
    t.color('secondaryColor');
    t.color('tertiaryColor');
    t.color('lineColor');
    expect(t.rootStyle()).toEqual({
      '--_s': 'var(--mermaid-secondaryColor,hsl(from var(--_p) calc(h - 120) s l / alpha))',
      '--_t':
        'var(--mermaid-tertiaryColor,hsl(from hsl(from var(--_p) calc(h + 180) s l / alpha) h s clamp(0, l + 5, 100) / alpha))',
      '--_l':
        'var(--mermaid-lineColor,color(from var(--_bg) srgb calc(1 - r) calc(1 - g) calc(1 - b) / alpha))',
      '--_p': 'var(--mermaid-primaryColor,#fff4dd)',
      '--_bg': 'var(--mermaid-background,#f4f4f4)',
    });
  });
});

describe('createTheme: the named classic themes pin v12 constructor values (#798, #773)', () => {
  // v12 sets mainBkg as a literal in each constructor and never recomputes it from primaryColor.
  const MAIN_BKG: readonly [ThemeName, string][] = [
    ['default', '#ececff'],
    ['dark', '#1f2020'],
    ['forest', '#cde498'],
    ['neutral', '#eeeeee'],
  ];

  it.each(MAIN_BKG)(
    '%s keeps mainBkg and actorBkg %s under a primaryColor override',
    async (name, fill) => {
      const t = createTheme(await loadTheme(name), {
        cssVariables: false,
        themeVariables: { primaryColor: '#ffcc00' },
      });
      expect([t.value('primaryColor'), t.value('mainBkg'), t.value('actorBkg')]).toEqual([
        '#ffcc00',
        fill,
        fill,
      ]);
    }
  );

  it.each(MAIN_BKG)(
    '%s: --mermaid-mainBkg repaints nodes, --mermaid-primaryColor does not (R-THEME-3)',
    async (name, fill) => {
      const t = createTheme(await loadTheme(name));
      expect(t.color('mainBkg')).toBe('var(--_mb)');
      expect(t.rootStyle()).toEqual({ '--_mb': `var(--mermaid-mainBkg,${fill})` });
    }
  );

  it("keeps v12's borders and text inks, which no base colour moves; arrowheads follow lineColor", async () => {
    const t = createTheme(await loadTheme('default'), {
      cssVariables: false,
      themeVariables: { primaryColor: '#2a4d69', secondaryColor: '#2a4d69', lineColor: '#ff0000' },
    });
    const names = [
      'primaryBorderColor',
      'secondaryBorderColor',
      'tertiaryBorderColor',
      'secondaryTextColor',
      'tertiaryTextColor',
      'arrowheadColor',
    ];
    expect(names.map(t.value)).toEqual([
      '#c7c7f1',
      '#eeeebc',
      '#e3f1c7',
      '#000021',
      '#060013',
      '#ff0000',
    ]);
  });

  it("derives dark's note and cluster fills from mainBkg, as v12's secondBkg", async () => {
    const t = createTheme(await loadTheme('dark'), {
      cssVariables: false,
      themeVariables: { mainBkg: '#ff0000' },
    });
    // v12 theme-dark updateColors: secondBkg = lighten(mainBkg, 16), hsl(0, 100%, 66%).
    expect(['noteBkgColor', 'clusterBkg'].map(t.value)).toEqual(['#ff5252', '#ff5252']);
    const own = createTheme(await loadTheme('dark'), { cssVariables: false });
    expect(['noteBkgColor', 'clusterBkg'].map(own.value)).toEqual(['#474949', '#474949']);
  });

  it('keeps the error and note colours under darkMode, as v12', async () => {
    const t = createTheme(await loadTheme('forest'), {
      cssVariables: false,
      themeVariables: { darkMode: true },
    });
    expect(['errorBkgColor', 'errorTextColor', 'noteBkgColor'].map(t.value)).toEqual([
      '#552222',
      '#552222',
      '#fff5ad',
    ]);
  });
});

describe('createTheme: output.cssVariables false (ADR-4)', () => {
  it('writes literal colours and no root aliases', () => {
    const t = createTheme(base, { cssVariables: false });
    expect(t.color('mainBkg')).toBe('#fff4dd');
    expect(t.color('nodeBorder')).toBe('#d9cfbc');
    expect(t.length('strokeWidth')).toBe(1);
    expect(t.rootStyle()).toEqual({});
  });
});

describe('createTheme: shape tokens (R-THEME-11)', () => {
  it('exposes tokens as CSS variables and as numbers for geometry', () => {
    const t = createTheme(base, { themeVariables: { radius: '8px', strokeWidth: 3 } });
    expect(t.number('radius')).toBe(8);
    expect(t.number('fontSize')).toBe(16);
    expect(t.length('strokeWidth')).toBe('var(--_sw)');
    expect(t.rootStyle()).toEqual({ '--_sw': 'var(--mermaid-strokeWidth,3px)' });
    expect(t.font()).toBe('var(--_ff)');
  });
});

describe('createTheme: opacity (D221)', () => {
  // A diagram's opacity variable, 0.7 in the classic family (as pie's slices, #325).
  const OPACITY: DiagramThemeTable = {
    vars: { sliceOpacity: { alias: 'so', kind: 'opacity' } },
    rules: { light: {} },
    families: { classic: { tokens: { sliceOpacity: 0.7 } } },
  };

  it('reads an opacity as a number in [0, 1], with no CSS variable', () => {
    const t = createTheme(base, { diagram: OPACITY });
    expect(t.number('sliceOpacity')).toBe(0.7);
    expect(t.rootStyle()).toEqual({});
    expect(() => t.color('sliceOpacity')).toThrow(TypeError);
    expect(() => t.length('sliceOpacity')).toThrow(TypeError);
  });

  it('takes a number or a numeric string between 0 and 1', () => {
    for (const [given, read] of [
      [0.4, 0.4],
      ['0.25', 0.25],
      [0, 0],
      [1, 1],
      [' 0.5 ', 0.5],
      ['1.0', 1],
    ] as const) {
      const t = createTheme(base, { diagram: OPACITY, themeVariables: { sliceOpacity: given } });
      expect(t.number('sliceOpacity'), String(given)).toBe(read);
    }
  });

  it('drops anything else with a warning and keeps the theme value', () => {
    for (const given of [1.5, -0.1, '70%', '1.01', '0.5px', '.5', 'abc', 'var(--x)', NaN, true]) {
      const warnings: ThemeWarning[] = [];
      const t = createTheme(base, {
        diagram: OPACITY,
        themeVariables: { sliceOpacity: given },
        warn: (w) => warnings.push(w),
      });
      expect(t.number('sliceOpacity'), String(given)).toBe(0.7);
      expect(
        warnings.map((w) => w.code),
        String(given)
      ).toEqual(['THEME_VARIABLE_DROPPED']);
    }
  });
});

describe('createTheme: drop shadow (#85)', () => {
  const BLACK_SHADOW = 'drop-shadow(4px 4px 0 rgb(0 0 0 / 0.06))';
  const WHITE_SHADOW = 'drop-shadow(4px 4px 0 rgb(255 255 255 / 0.06))';

  it.each([
    ['redux', BLACK_SHADOW],
    ['redux-color', BLACK_SHADOW],
    ['redux-dark', WHITE_SHADOW],
    ['redux-dark-color', WHITE_SHADOW],
    ['default', 'none'],
    ['dark', 'none'],
    ['forest', 'none'],
    ['neutral', 'none'],
    ['base', 'none'],
    // v12 theme-neo.js, normalised (D181).
    ['neo', 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.25))'],
    // v12 theme-neo-dark.js, normalised (D181).
    ['neo-dark', 'drop-shadow(1px 2px 2px rgb(185 185 185 / 0.2))'],
  ] as const)('%s has dropShadow %s', async (name, value) => {
    const t = createTheme(await loadTheme(name), { cssVariables: false });
    expect(t.value('dropShadow')).toBe(value);
    expect(t.filter('dropShadow')).toBe(value);
  });

  it('references the shadow through an alias, with the theme value as fallback', async () => {
    const t = createTheme(await loadTheme('redux-color'));
    expect(t.filter('dropShadow')).toBe('var(--_ds)');
    expect(t.rootStyle()).toEqual({ '--_ds': `var(--mermaid-dropShadow,${BLACK_SHADOW})` });
    const w = streamWriter();
    w.leaf('svg', { style: styleText(t.rootStyle()), filter: t.filter('dropShadow') });
    assertInert(w.finish());
  });

  it('takes a themeVariables override, including none', async () => {
    const spec = await loadTheme('redux-color');
    const off = createTheme(spec, { themeVariables: { dropShadow: 'none' }, cssVariables: false });
    expect(off.value('dropShadow')).toBe('none');
    const red = createTheme(spec, {
      themeVariables: { dropShadow: 'drop-shadow(2px 2px 0 red)' },
      cssVariables: false,
    });
    expect(red.value('dropShadow')).toBe('drop-shadow(2px 2px 0 red)');
  });

  it.each(['url(#drop-shadow)', 'blur(4px)', 'drop-shadow(4px 4px 0 red) url(x)', 42])(
    'drops an unsafe override %j with THEME_VARIABLE_DROPPED',
    async (value) => {
      const warnings: ThemeWarning[] = [];
      const t = createTheme(await loadTheme('redux-color'), {
        themeVariables: { dropShadow: value },
        cssVariables: false,
        warn: (w) => warnings.push(w),
      });
      expect(t.value('dropShadow')).toBe(BLACK_SHADOW);
      expect(warnings.map((w) => w.code)).toEqual(['THEME_VARIABLE_DROPPED']);
    }
  );
});

describe('createTheme: author fills get contrasting ink (R-THEME-12)', () => {
  it('keeps the theme ink when it reads, and picks one that does otherwise', () => {
    const t = createTheme(base);
    expect(t.ink('#ffffff')).toBeUndefined();
    expect(t.ink('#f9f')).toBeUndefined();
    expect(t.ink('#000080')).toBe('#ffffff');
    expect(t.ink('darkred')).toBe('#ffffff');
    // Unknown or mostly transparent fills keep the theme ink.
    expect(t.ink('var(--mermaid-x)')).toBeUndefined();
    expect(t.ink('rgba(0,0,0,0.2)')).toBeUndefined();
  });
});

describe('standalone SVG (R-THEME-2)', () => {
  it('renders with no host CSS: every alias carries its fallback, and the output is inert', () => {
    const t = createTheme(base);
    const fill = t.color('mainBkg');
    const stroke = t.color('nodeBorder');
    const width = t.length('strokeWidth');
    // The body is rendered first; rootStyle() then holds every alias it used.
    const w = streamWriter();
    w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', style: styleText(t.rootStyle()) });
    w.leaf('rect', { width: 10, height: 10, fill, stroke, 'stroke-width': width });
    w.close();
    const svg = w.finish();
    assertInert(svg);
    expect(svg).toContain('--_p:var(--mermaid-primaryColor,#fff4dd)');
    expect(svg).toContain('fill="var(--_mb)"');
    // Every var(--_x) used is declared on the root.
    for (const m of svg.matchAll(/var\((--_\w+)\)/g)) expect(svg).toContain(m[1] + ':');
  });
});

describe('createTheme: extra rules (config fragments, D153)', () => {
  it('reads a variable a rule table adds as a colour aliased by its name', async () => {
    const spec = await loadTheme('default');
    const theme = createTheme(spec, { rules: { fixtureInk: 'primaryTextColor' } });
    expect(theme.color('fixtureInk')).toBe('var(--_fixtureInk)');
    expect(theme.value('fixtureInk')).toBe(theme.value('primaryTextColor'));
    expect(theme.rootStyle()).toHaveProperty('--_fixtureInk');
    const set = createTheme(spec, {
      rules: { fixtureInk: 'primaryTextColor' },
      themeVariables: { fixtureInk: '#ff0000' },
    });
    expect(set.value('fixtureInk')).toBe('#ff0000');
  });
});
