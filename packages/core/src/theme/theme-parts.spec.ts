/**
 * A theme's derived parts are kept for equal overrides (TH4): by the overrides' value, never by
 * the object that holds them. Each render still gets its own theme (the variables it used, its
 * gradient id) and its own copy of the warnings the overrides gave, in the order they came.
 * An override that is not plain data (here an unknown variable holding a `Date`, which the theme
 * ignores) leaves the parts unkept: that is the reference every kept read is checked against.
 */
import { describe, expect, it } from 'vitest';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';
import {
  createTheme,
  loadTheme,
  PALETTE_VARIABLES,
  type DiagramThemeTable,
  type ThemeName,
  type ThemeOptions,
  type ThemeSpec,
  type ThemeWarning,
} from './index.ts';

const NAMES = Object.keys(THEME_VARIABLE_TABLE);
const specs: Record<string, ThemeSpec> = {};
for (const name of ['base', 'default', 'dark', 'forest', 'neutral'] as ThemeName[])
  specs[name] = await loadTheme(name);

/** Everything a render reads from a theme, in a fixed order, with the warnings it gave. */
function reading(spec: ThemeSpec, options: ThemeOptions, prefix = 'm') {
  const warnings: ThemeWarning[] = [];
  const t = createTheme(spec, {
    ...options,
    warn: (w) => warnings.push(w),
    idPrefix: () => prefix,
  });
  const values = NAMES.map((n) => {
    const kind = THEME_VARIABLE_TABLE[n]!.kind;
    const used = kind === 'color' ? t.color(n) : kind === 'length' ? t.length(n) : undefined;
    return [n, t.value(n), used];
  });
  const palettes = PALETTE_VARIABLES.map((p) => [p, t.palette(p), t.paletteRgba(p)]);
  return {
    values,
    palettes,
    dark: t.dark,
    gradient: t.gradient(),
    rootStyleText: t.rootStyleText(),
    auto: t.autoDeclarations(),
    ink: t.ink('#123456'),
    warnings,
  };
}

/** The same overrides with an extra unknown name whose value is not plain data. */
const unkept = (tv: Record<string, unknown>) => ({ ...tv, zzNotPlainData: new Date(0) });

describe('createTheme: parts kept for equal overrides', () => {
  const OVERRIDES: Record<string, unknown>[] = [
    { primaryColor: '#ff0000' },
    { primaryColor: '#ff0000', lineColor: 'url(javascript:x)', fontFamily: 'a</style>' },
    { darkMode: true, background: '#000000' },
    { darkMode: 'true', primaryTextColor: '#eeeeee', cScale3: '#00ff00', cScale99: '#000' },
    { cScale: '#111111,#222222,bad', git0: 'red', gitInv2: 'nope' },
    { useGradient: 'true', gradientStart: '#ff0000', gradientStop: '#0000ff' },
    { fontSize: '20px', strokeWidth: 3, nodePaddingX: '2x', radius: 'x' },
    { plotColorArray: [], borderColorArray: ['#ffffff', '#000000'] },
    { primaryColor: '#ff0000', notAVariable: '#123456' },
    { packet: { startByteColor: '#ff0000' } },
  ];

  it('reads as unkept parts read, and replays the warnings to each render', () => {
    for (const spec of Object.values(specs))
      for (const tv of OVERRIDES) {
        const want = reading(spec, { themeVariables: unkept(tv) });
        // First the parts are made, then kept: both reads, from fresh but equal objects.
        for (let n = 0; n < 3; n++) {
          const got = reading(spec, {
            themeVariables: JSON.parse(JSON.stringify(tv)) as Record<string, unknown>,
          });
          expect(got).toEqual(want);
        }
        expect(reading(spec, { themeVariables: Object.freeze({ ...tv }) })).toEqual(want);
      }
  });

  it('gives each render its own used variables and gradient id', () => {
    const tv = { useGradient: 'true', primaryColor: '#ff0000' };
    const a = createTheme(specs.base!, { themeVariables: { ...tv }, idPrefix: () => 'a' });
    a.color('lineColor');
    const b = createTheme(specs.base!, { themeVariables: { ...tv }, idPrefix: () => 'b' });
    b.color('primaryColor');
    expect(a.rootStyle()).toHaveProperty('--_l');
    expect(a.rootStyle()).not.toHaveProperty('--_p');
    expect(b.rootStyle()).toEqual({ '--_p': 'var(--mermaid-primaryColor,#ff0000)' });
    expect(a.gradient()?.id).toBe('a-gradient');
    expect(b.gradient()?.id).toBe('b-gradient');
  });

  it('follows an overrides object changed in place', () => {
    const tv: Record<string, unknown> = { primaryColor: '#ff0000' };
    const a = createTheme(specs.base!, { themeVariables: tv, cssVariables: false });
    expect(a.color('primaryColor')).toBe('#ff0000');
    tv.primaryColor = '#00ff00';
    const b = createTheme(specs.base!, { themeVariables: tv, cssVariables: false });
    expect(b.color('primaryColor')).toBe('#00ff00');
  });

  it('tells apart overrides that print alike', () => {
    const lit = (tv: Record<string, unknown>) =>
      createTheme(specs.base!, { themeVariables: tv, cssVariables: false }).number('strokeWidth');
    expect(lit({ strokeWidth: 2 })).toBe(2);
    expect(lit({ strokeWidth: '2' })).toBe(2);
    expect(lit({ strokeWidth: 3 })).toBe(3);
    const warned = (tv: Record<string, unknown>) => {
      const w: ThemeWarning[] = [];
      createTheme(specs.base!, { themeVariables: tv, warn: (x) => w.push(x) });
      return w.length;
    };
    expect(warned({ primaryColor: 'red' })).toBe(0);
    expect(warned({ primaryColor: 'url(x)' })).toBe(1);
    expect(warned({ primaryColor: 'red' })).toBe(0);
    expect(warned({ primaryColor: 'url(x)' })).toBe(1);
  });

  it('keeps parts apart by spec, dark spec, diagram table and rule table', () => {
    const tv = { primaryColor: '#ff0000', fixture: { fill: '#00ff00' } };
    const table: DiagramThemeTable = {
      section: 'fixture',
      vars: { fixtureFill: { alias: 'ff1', kind: 'color', nested: 'fill' } },
      rules: { light: { fixtureFill: 'primaryColor' } },
    };
    const options: ThemeOptions[] = [
      { themeVariables: tv },
      { themeVariables: tv, dark: specs.dark },
      { themeVariables: tv, diagram: table },
      { themeVariables: tv, rules: { fixtureInk: 'lineColor' } },
    ];
    for (const spec of [specs.base!, specs.forest!])
      for (const o of options) {
        const want = reading(spec, { ...o, themeVariables: unkept(tv) });
        expect(reading(spec, { ...o, themeVariables: { ...tv } })).toEqual(want);
      }
  });

  it('reads right after many different overrides have pushed the first ones out', () => {
    const want = reading(specs.default!, { themeVariables: unkept({ primaryColor: '#000001' }) });
    for (let n = 1; n <= 40; n++) {
      const hex = `#${n.toString(16).padStart(6, '0')}`;
      expect(reading(specs.default!, { themeVariables: { primaryColor: hex } }).values).toEqual(
        reading(specs.default!, { themeVariables: unkept({ primaryColor: hex }) }).values
      );
    }
    expect(reading(specs.default!, { themeVariables: { primaryColor: '#000001' } })).toEqual(want);
  });
});
