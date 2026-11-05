import { describe, expect, it } from 'vitest';
import { assertInert, streamWriter, styleText } from '../svg/index.ts';
import { createTheme, loadTheme, type ThemeWarning } from './index.ts';

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
        pie1: '#123456',
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

describe('createTheme: composite state backgrounds (#192, D120)', () => {
  // v12 12.2.0 theme-*.js: the redux themes pin both; the classic ones derive the title strip
  // from mainBkg and give altBackground a literal (base: tertiaryColor).
  it.each([
    ['redux', '#f9f9fb', '#f9f9fb'],
    ['redux-color', '#f9f9fb', '#f9f9fb'],
    ['redux-dark', '#16141f', '#16141f'],
    ['redux-dark-color', '#16141f', '#16141f'],
    ['default', '#ececff', '#f0f0f0'],
    ['dark', '#1f2020', '#555555'],
    ['forest', '#cde498', '#f0f0f0'],
    ['neutral', '#eeeeee', '#f4f4f4'],
    ['base', '#fff4dd', '#f6f9ff'],
    ['neo', '#ffffff', '#f0f0f0'],
    ['neo-dark', '#2a2020', '#f0f0f0'],
  ] as const)('%s: compositeTitleBackground %s, altBackground %s', async (name, title, alt) => {
    const t = createTheme(await loadTheme(name), { cssVariables: false });
    expect(t.value('compositeTitleBackground')).toBe(title);
    expect(t.value('altBackground')).toBe(alt);
  });

  // D126: v12's compositeBackground is the theme background, except on the dark redux themes.
  it.each([
    ['redux', '#ffffff'],
    ['redux-color', '#ffffff'],
    ['redux-dark', '#16141f'],
    ['redux-dark-color', '#16141f'],
    ['default', '#ffffff'],
    ['dark', '#333333'],
    ['forest', '#ffffff'],
    ['neutral', '#ffffff'],
    ['base', '#f4f4f4'],
    ['neo', '#ffffff'],
    ['neo-dark', '#333333'],
  ] as const)('%s: compositeBackground %s (D126)', async (name, body) => {
    const t = createTheme(await loadTheme(name), { cssVariables: false });
    expect(t.value('compositeBackground')).toBe(body);
  });

  it('derives the composite body from background, as v12 does (D126)', async () => {
    const t = createTheme(await loadTheme('default'), {
      themeVariables: { background: '#abcdef' },
      cssVariables: false,
    });
    expect(t.value('compositeBackground')).toBe('#abcdef');
  });

  it('derives the classic title strip from mainBkg, as v12 does', async () => {
    const t = createTheme(await loadTheme('default'), {
      themeVariables: { mainBkg: '#123456' },
      cssVariables: false,
    });
    expect(t.value('compositeTitleBackground')).toBe('#123456');
  });

  it('takes themeVariables overrides', async () => {
    const t = createTheme(await loadTheme('redux-color'), {
      themeVariables: { compositeTitleBackground: '#ff0000', altBackground: '#00ff00' },
      cssVariables: false,
    });
    expect(t.value('compositeTitleBackground')).toBe('#ff0000');
    expect(t.value('altBackground')).toBe('#00ff00');
  });
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
