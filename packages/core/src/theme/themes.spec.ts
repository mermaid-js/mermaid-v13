import { describe, expect, it } from 'vitest';
import { CORE_DEFAULTS, resolveConfig } from '../config/index.ts';
import {
  BASE_VARIABLES,
  THEME_NAMES,
  THEME_VARIABLES,
  composite,
  contrastRatio,
  createTheme,
  loadTheme,
  loadedTheme,
  parseColor,
  resolveThemeName,
  type Rgba,
  type ThemeWarning,
} from './index.ts';

const specs = await Promise.all(THEME_NAMES.map((n) => loadTheme(n)));

// Text drawn on a fill, per the flowchart and core renderers.
const TEXT_ON_FILL: readonly [text: string, fill: string][] = [
  ['primaryTextColor', 'primaryColor'],
  ['secondaryTextColor', 'secondaryColor'],
  ['tertiaryTextColor', 'tertiaryColor'],
  ['nodeTextColor', 'mainBkg'],
  ['titleColor', 'clusterBkg'],
  ['textColor', 'edgeLabelBackground'],
  ['textColor', 'background'],
  ['noteTextColor', 'noteBkgColor'],
  ['errorTextColor', 'background'],
];

describe('built-in themes', () => {
  it('ships the redux family and default, dark, forest, neutral and base (D64, D151)', () => {
    expect(specs.map((s) => s.name)).toEqual([...THEME_NAMES]);
    expect([...THEME_NAMES].sort()).toEqual(
      [
        'redux',
        'redux-color',
        'redux-dark',
        'redux-dark-color',
        'default',
        'dark',
        'forest',
        'neutral',
        'base',
        'neo',
        'neo-dark',
      ].sort()
    );
    expect(specs.filter((s) => s.dark).map((s) => s.name)).toEqual([
      'redux-dark',
      'redux-dark-color',
      'dark',
      'neo-dark',
    ]);
  });

  it.each(specs.map((s) => [s.name, s] as const))(
    '%s meets WCAG AA for text on fills (R-THEME-9)',
    (_name, spec) => {
      const t = createTheme(spec, { cssVariables: false });
      const bg = t.rgba('background') as Rgba;
      const failures: string[] = [];
      for (const [text, fill] of TEXT_ON_FILL) {
        const f = t.rgba(fill) as Rgba;
        const under = f[3] < 1 ? composite(f, bg) : f;
        const ratio = contrastRatio(t.rgba(text) as Rgba, under);
        if (!(ratio >= 4.5)) failures.push(`${text} on ${fill}: ${ratio.toFixed(2)}`);
      }
      expect(failures).toEqual([]);
    }
  );

  it.each(specs.map((s) => [s.name, s] as const))(
    '%s resolves every inventory variable to a safe literal',
    (_name, spec) => {
      const t = createTheme(spec, { cssVariables: false });
      for (const [name, def] of Object.entries(THEME_VARIABLES)) {
        const v = t.value(name);
        if (def.kind === 'color') expect(parseColor(v), `${spec.name}.${name}=${v}`).toBeDefined();
        else expect(v, name).not.toBe('');
      }
    }
  );

  it('renders fully from at most 8 base variables (R-THEME-5)', async () => {
    expect(BASE_VARIABLES.length).toBeLessThanOrEqual(8);
    const base = await loadTheme('base');
    expect(base.values).toBeUndefined();
    // v12 theme-base derives arrowheadColor from background, not from lineColor (#797).
    expect(base.rules).toEqual({ arrowheadColor: 'invert(background)' });
    const vars = {
      primaryColor: '#1d3557',
      secondaryColor: '#a8dadc',
      tertiaryColor: '#f1faee',
      background: '#ffffff',
      primaryTextColor: '#111111',
      lineColor: '#457b9d',
      fontFamily: 'Georgia, serif',
      fontSize: '15px',
    };
    const t = createTheme(base, { themeVariables: vars, cssVariables: false });
    expect(t.value('mainBkg')).toBe('#1d3557');
    // Dark primary: node text flips to the light ink and stays readable.
    expect(t.value('nodeTextColor')).toBe('#ffffff');
    expect(t.value('clusterBkg')).toBe('#f1faee');
    expect(t.value('defaultLinkColor')).toBe('#457b9d');
    expect(t.value('arrowheadColor')).toBe('#000000');
    expect(t.number('fontSize')).toBe(15);
    expect(t.font()).toBe('Georgia, serif');
  });

  it('honours darkMode on the base theme, as v12 does', async () => {
    const base = await loadTheme('base');
    const t = createTheme(base, {
      themeVariables: { darkMode: true, primaryColor: '#202020' },
      cssVariables: false,
    });
    expect(t.dark).toBe(true);
    // Dark rule: borders lighten.
    expect(t.value('primaryBorderColor')).toBe('#4d4d4d');
  });
});

describe('theme names', () => {
  it('defaults to redux-color, which is always loaded for renderSync (D151)', () => {
    expect(resolveThemeName(undefined)).toEqual({ name: 'redux-color' });
    expect(loadedTheme('redux-color')?.name).toBe('redux-color');
  });

  it('renders with no user theme in redux-color, the schema default (D151)', () => {
    const config = resolveConfig(CORE_DEFAULTS, undefined, undefined, [], {
      flowchart: { theme: 'redux-color' },
    });
    expect(config.theme).toBe('redux-color');
    expect(resolveThemeName(config.theme)).toEqual({ name: 'redux-color' });
    const chosen = resolveConfig(CORE_DEFAULTS, undefined, { theme: 'forest' }, [], {
      flowchart: { theme: 'redux-color' },
    });
    expect(resolveThemeName(chosen.theme)).toEqual({ name: 'forest' });
  });

  it('resolves the redux family to their own specs, with no warning (D151)', () => {
    const warnings: ThemeWarning[] = [];
    const warn = (w: ThemeWarning) => warnings.push(w);
    for (const name of ['redux', 'redux-color', 'redux-dark', 'redux-dark-color'])
      expect(resolveThemeName(name, warn)).toEqual({ name });
    expect(warnings).toEqual([]);
  });

  it('resolves neo to its own spec, with no warning (D180)', async () => {
    const warnings: ThemeWarning[] = [];
    expect(resolveThemeName('neo', (w) => warnings.push(w))).toEqual({ name: 'neo' });
    expect(warnings).toEqual([]);
    expect((await loadTheme('neo')).name).toBe('neo');
  });

  it('resolves neo-dark to its own spec, with no warning (D180)', async () => {
    const warnings: ThemeWarning[] = [];
    expect(resolveThemeName('neo-dark', (w) => warnings.push(w))).toEqual({ name: 'neo-dark' });
    expect(warnings).toEqual([]);
    expect((await loadTheme('neo-dark')).name).toBe('neo-dark');
  });

  it('stands in for unknown names and null, with a warning', () => {
    const warnings: ThemeWarning[] = [];
    const warn = (w: ThemeWarning) => warnings.push(w);
    expect(resolveThemeName('null', warn)).toEqual({ name: 'base' });
    expect(resolveThemeName('purple', warn)).toEqual({ name: 'redux-color' });
    expect(resolveThemeName('__proto__', warn)).toEqual({ name: 'redux-color' });
    expect(warnings.map((w) => w.code)).toEqual([
      'THEME_UNAVAILABLE',
      'THEME_UNAVAILABLE',
      'THEME_UNAVAILABLE',
    ]);
  });

  it('auto pairs the default with dark (R-THEME-8)', () => {
    expect(resolveThemeName('auto')).toEqual({ name: 'redux-color', dark: 'dark' });
  });
});

describe('node padding per theme (#83, D151, D152)', () => {
  const PADDING = [
    'nodePaddingX',
    'nodePaddingY',
    'stadiumPaddingX',
    'stadiumPaddingY',
    'hexagonPaddingX',
    'hexagonPaddingY',
    'hexagonSlant',
    'doubleCircleGap',
    'doubleCirclePadding',
    'circlePadding',
    'circleMinDiameter',
    'subroutinePaddingX',
    'subroutinePaddingY',
    'cylinderPaddingX',
    'cylinderPaddingY',
    'leanPaddingX',
    'leanPaddingY',
    'oddPaddingX',
    'oddPaddingY',
  ] as const;
  // v12 neo, with v13's circle (D151).
  const REDUX = [16, 12, 40, 24, 70, 32, 3.5, 12, 16, 16, 44, 28, 12, 24, 24, 30, 15, 42, 24];
  // v12 classic at flowchart.padding 15 (2 × padding / padding, …, no circle minimum).
  const CLASSIC = [30, 15, 15, 15, 15, 15, 4, 5, 15, 15, 0, 15, 15, 15, 15, 15, 15, 15, 15];
  const expected: Record<string, number[]> = {
    redux: REDUX,
    'redux-color': REDUX,
    'redux-dark': REDUX,
    'redux-dark-color': REDUX,
    default: CLASSIC,
    dark: CLASSIC,
    forest: CLASSIC,
    neutral: CLASSIC,
    base: CLASSIC,
    // D181: neo takes the redux family's v12 `look: neo` geometry.
    neo: REDUX,
    'neo-dark': REDUX,
  };
  const theme = (name: string, options: Parameters<typeof createTheme>[1] = {}) =>
    createTheme(specs.find((s) => s.name === name)!, options);
  const resolved = (name: string, padding: number) => {
    const t = theme(name);
    return PADDING.map((v) =>
      THEME_VARIABLES[v]!.kind === 'padding' ? t.padding(v, padding) : t.number(v)
    );
  };

  it('covers every shipped theme', () => {
    expect(Object.keys(expected).sort()).toEqual([...THEME_NAMES].sort());
  });

  it.each(Object.entries(expected))('pins %s', (name, values) => {
    expect(resolved(name, 15)).toEqual(values);
  });

  it('scales the classic values with the diagram padding; in redux only the lean padding', () => {
    expect(resolved('default', 10)).toEqual([
      20, 10, 10, 10, 10, 10, 4, 5, 10, 10, 0, 10, 10, 10, 10, 10, 10, 10, 10,
    ]);
    // v12 neo lean and trapezoid shapes take 2 × padding / padding too.
    expect(resolved('redux-color', 10)).toEqual([...REDUX.slice(0, 15), 20, 10, 42, 24]);
  });

  it('takes px or a multiple of padding from themeVariables, and drops anything else', () => {
    const warnings: ThemeWarning[] = [];
    const t = theme('redux-color', {
      themeVariables: { nodePaddingX: '3 * padding', nodePaddingY: '9px', circlePadding: '-4' },
      warn: (w) => warnings.push(w),
    });
    expect(t.padding('nodePaddingX', 10)).toBe(30);
    expect(t.padding('nodePaddingY', 10)).toBe(9);
    expect(t.padding('circlePadding', 10)).toBe(16);
    expect(warnings.map((w) => w.code)).toEqual(['THEME_VARIABLE_DROPPED']);
  });

  it('never writes a padding variable as a CSS alias (D152)', () => {
    const t = theme('redux-color');
    t.padding('nodePaddingX', 15);
    t.number('hexagonSlant');
    expect(t.rootStyle()).toEqual({});
  });
});
